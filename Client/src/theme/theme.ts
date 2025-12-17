import { createTheme } from "@mui/material/styles";

const theme = createTheme({
  palette: {
    mode: "dark",
    background: {
      default: "#313338",
      paper: "#2b2d31",
    },
    primary: {
      main: "#5865F2",
    },
    text: {
      primary: "#f2f3f5",
      secondary: "#b5bac1",
    },
    divider: "#1e1f22",
  },
  shape: {
    borderRadius: 8,
  },
  typography: {
    fontFamily: `"Inter", system-ui, sans-serif`,
    fontSize: 14,
  },
});

export default theme;
