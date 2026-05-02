const path = require("node:path");
const { app, BrowserWindow } = require("electron");

function createWindow() {
  const clientRoot = path.resolve(__dirname, "..", "..");
  const win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1080,
    minHeight: 720,
    title: "Story KB",
    backgroundColor: "#f4f2ec",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      additionalArguments: [`--story-kb-root=${clientRoot}`],
    },
  });

  win.removeMenu();
  win.loadFile(path.join(clientRoot, "index.html"));
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
