import "./style.css";
import { APP_NAME, welcomeText } from "./info";

const root = document.getElementById("app");
if (!root) {
  throw new Error("Elemento #app non trovato in index.html");
}

const title = document.createElement("h1");
title.textContent = APP_NAME;

const message = document.createElement("p");
message.textContent = welcomeText();

root.append(title, message);
