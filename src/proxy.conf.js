const PROXY_CONFIG = [
    {
        context: [
            "/TersectBrowser/tbapi",
            "/TersectBrowser/tgrc"
        ],
        target: "http://localhost:4500",
        secure: false
    }
];

module.exports = PROXY_CONFIG;
