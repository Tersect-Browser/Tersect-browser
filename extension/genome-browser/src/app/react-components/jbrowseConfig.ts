 const config = { "theme": {
    "palette": {
      "primary": {
        "main": "#459e00"
      },
      "secondary": {
        "main": "#459e00"
      },
      "tertiary": {
        "main": "#327e04"
      },
      "quaternary": {
        "main": "#459e00"
      },
    },
    components: {
      MuiPaper : {
        styleOverrides: {
          root: {
            boxShadow: 'none',
          },
        },
      }
    }
  },
  rpc: {
    defaultDriver: 'WebWorkerRpcDriver',
  },

  };

  export default config;