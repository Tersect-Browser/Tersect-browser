#!/usr/bin/env julia
# backend/src/scripts/plot_phylonet.jl

# ---- bootstrap packages (R-style auto-install) ----
import Pkg

# Activate a project at the script location so packages persist between runs.
try
    Pkg.activate(@__DIR__)
catch e
    @warn "Could not activate project at script dir; using shared env" exception=(e, catch_backtrace())
    Pkg.activate(; shared=true)
end

# Install + load a package list, then `using` them into Main
function _ensure_and_load(pkgs::Vector{String})
    for pkg in pkgs
        if Base.find_package(pkg) === nothing
            @info "Adding missing package $pkg"
            Pkg.add(pkg)
        end
        @eval using $(Symbol(pkg))
    end
end

# NOTE: PhyloPlots uses R graphics, so we need RCall available.
_ensure_and_load([
    "ArgParse",
    "PhyloNetworks",
    "PhyloPlots",
    "RCall",
])

using ArgParse
using PhyloNetworks
using PhyloPlots
using RCall    # to open/close R devices for saving

# ---- CLI ----
function parse_cli()
    s = ArgParseSettings()
    @add_arg_table! s begin
        "--enewick"
            help = "Extended-Newick network: either the literal string or a path to a file containing one line"
            required = true
        "--out"
            help = "Output image (.svg or .png)"
            required = true
        "--width"
            help = "Figure width (px)"
            arg_type = Int
            default = 900
        "--height"
            help = "Figure height (px)"
            arg_type = Int
            default = 600
    end
    return parse_args(s)
end

# ---- helpers ----
"""
    read_net_from_arg(s::AbstractString)

Accepts either a filename or a Newick/enewick string.
- If `s` is a path, reads the file contents; otherwise treats it as the literal network.
- Strips a leading numeric score like `-13.3183:` if present.
- Ensures a trailing `;`.
- Parses from an `IOBuffer` so strings are never treated as filenames.
"""
function read_net_from_arg(s::AbstractString)
    txt = ispath(s) ? String(read(s)) : s
    txt = strip(txt)

    # Drop a leading score like "-13.3183:" or "1.23e-4:" if present
    if occursin(r"^\s*[-+]?(\d+(\.\d+)?([eE][-+]?\d+)?):", txt)
        txt = replace(txt, r"^\s*[-+]?(\d+(\.\d+)?([eE][-+]?\d+)?):\s*" => "")
    end

    # Keep only first line if multi-line was passed
    txt = first(split(txt, '\n'))

    # Ensure Newick terminator
    endswith(txt, ";") || (txt *= ";")

    # Parse from an IOBuffer to avoid "string as filename"
    return PhyloNetworks.readnewick(IOBuffer(txt))
end

# ---- main ----
function main()
    args = parse_cli()
    net = read_net_from_arg(args["enewick"])

    out   = args["out"]
    wpx   = args["width"]
    hpx   = args["height"]

    if endswith(lowercase(out), ".png")
        # R's png() takes width/height in pixels by default
        @rput out wpx hpx
        R"""
        png(filename = $out, width = $wpx, height = $hpx, units = 'px', res = 96)
        """
        PhyloPlots.plot(net)
        R"dev.off()"

    elseif endswith(lowercase(out), ".svg")
        # SVG width/height are in inches; convert px -> inches at 96 dpi
        win = wpx / 96
        hin = hpx / 96
        @rput out win hin
        # Prefer svglite if installed (you have r-svglite in your conda env)
        R"""
        if (requireNamespace("svglite", quietly = TRUE)) {
            svglite::svglite(filename = $out, width = $win, height = $hin)
        } else {
            svg(filename = $out, width = $win, height = $hin)
        }
        """
        PhyloPlots.plot(net)
        R"dev.off()"

    else
        error("Unsupported extension. Use .svg or .png")
    end
end

main()
