import { GoogleGenAI } from "@google/genai";
import fs from "fs";

async function main() {
  const env = JSON.parse(fs.readFileSync('src/store/pony-prompt.json', 'utf8')); // fake or something
  // or we can use our own key if needed, or we just rely on process.env
  console.log("No API Key");
}
main();
