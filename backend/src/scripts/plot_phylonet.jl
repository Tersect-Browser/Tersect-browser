#!/usr/bin/env julia
# backend/src/scripts/plot_phylonet.jl

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
using RCall
using Statistics: mean

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
- Uses only the first line (if multi-line).
- Ensures a trailing `;`.
- Parses from an `IOBuffer` so strings are never treated as filenames.
"""
function read_net_from_arg(s::AbstractString)
    txt = ispath(s) ? String(read(s)) : String(s)
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

# if it's a file path, read it; otherwise return the string as-is
as_string_or_file(s::AbstractString) = isfile(String(s)) ? read(String(s), String) : String(s)

"""
    retic_summary(rn::AbstractString) -> Dict{String, NamedTuple}

Parse reticulation entries like `#H1:<len>::<gamma>` from Extended-Newick.
Returns Dict where each key is "H<id>" and value has:
  - gammas::Vector{Float64}    # two values that should sum ≈ 1
  - lengths::Vector{Float64}   # the two parent→hybrid edge lengths
  - g_major::Float64           # max(gammas)
  - g_minor::Float64           # min(gammas) or 1 - g_major if only one seen
  - mean_len::Float64          # mean(lengths)
"""
function retic_summary(rn::AbstractString)
    pat = r"#H(\d+):([\-+]?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)::(\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)"
    ms = collect(eachmatch(pat, rn))
    byid = Dict{String, Vector{Tuple{Float64,Float64}}}()
    for m in ms
        id  = "H" * m.captures[1]
        len = parse(Float64, m.captures[2])  # parent→hybrid edge length
        gam = parse(Float64, m.captures[3])  # inheritance prob from that parent
        push!(get!(byid, id, Vector{Tuple{Float64,Float64}}()), (len, gam))
    end
    out = Dict{String, NamedTuple}()
    for (id, vec) in byid
        lens = [t[1] for t in vec]               # Vector{Float64}
        gams = [t[2] for t in vec]               # Vector{Float64}
        g_major = maximum(gams)
        g_minor = length(gams) > 1 ? minimum(gams) : (1 - g_major)
        out[id] = (gammas = gams,
                   lengths = lens,
                   g_major = g_major,
                   g_minor = g_minor,
                   mean_len = mean(lens))
    end
    return out
end

# ---- main ----
function main()
    args = parse_cli()
    net = read_net_from_arg(args["enewick"])  # parsed network (PhyloNetworks)

    # Extended-Newick text for legend extraction
    rn = as_string_or_file(args["enewick"])
    retics = retic_summary(rn)

    # Build a concise legend for the first reticulation (if present)
    legend = ""
    if !isempty(retics)
        id, info = first(retics)
        legend = "γ = $(round(info.g_major; digits=3)) / $(round(info.g_minor; digits=3))    " *
                 "hybrid edge lengths = $(round(info.lengths[1]; digits=3)), $(round(info.lengths[end]; digits=3))" *
                 " (mean = $(round(info.mean_len; digits=3)))"
        # NOTE: these lengths are the time from each parent to the hybridization event
        # in the model’s time units (often coalescent units if optimized with -po).
    end

    out = args["out"]
    wpx = 1600                 # keep your fixed width
    hpx = args["height"]

    if endswith(lowercase(out), ".png")
        @rput out wpx hpx legend
        R"""
        png(filename = $out, width = $wpx, height = $hpx, units = 'px', res = 96)
        """
        PhyloPlots.plot(net)
        R"""
        if (nzchar($legend)) {
          usr <- par("usr")
          x <- usr[1] + 0.02*(usr[2]-usr[1])
          y <- usr[4] - 0.03*(usr[4]-usr[3])
          text(x, y, labels = $legend, adj = c(0,1))
        }
        """
        R"dev.off()"

    elseif endswith(lowercase(out), ".svg")
        win = wpx / 96
        hin = hpx / 96
        @rput out win hin legend
        R"""
        if (requireNamespace("svglite", quietly = TRUE)) {
          svglite::svglite(filename = $out, width = $win, height = $hin)
        } else {
          svg(filename = $out, width = $win, height = $hin)
        }
        """
        PhyloPlots.plot(net)
        R"""
        if (nzchar($legend)) {
          usr <- par("usr")
          x <- usr[1] + 0.02*(usr[2]-usr[1])
          y <- usr[4] - 0.03*(usr[4]-usr[3])
          text(x, y, labels = $legend, adj = c(0,1))
        }
        """
        R"dev.off()"

    else
        error("Unsupported extension. Use .svg or .png")
    end
end

main()
