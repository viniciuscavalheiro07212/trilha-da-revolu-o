import fs from "node:fs";
import path from "node:path";

const runtimeFile = "08557711-cf2c-49ff-8494-70b576dcc769.js";
const source = path.join("assets", runtimeFile);
const destination = path.join("dist", "assets", runtimeFile);

fs.mkdirSync(path.dirname(destination), { recursive: true });
fs.copyFileSync(source, destination);

console.log(`Copied Cloud Code Design runtime: ${destination}`);
