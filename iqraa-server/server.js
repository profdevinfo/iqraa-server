import express from "express";
import ViteExpress from "vite-express";

const app = express();


ViteExpress.config({ 
  inlineViteConfig: { 
     base: "/admin", 
     build: { outDir: "dist" }
  } 
});

app.get("/message", (_, res) => res.send("Hello from express!"));

ViteExpress.listen(app, 3000, () => console.log("Server is listening..."));