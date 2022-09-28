import {choc, DOM, set_content} from "https://rosuav.github.io/choc/factory.js";
const {} = choc; //autoimport
import {render} from "./sections.js";

//TODO: Spawn entries for every section not in the main layout
//plus one for Horizontal Split, one for Vertical Split

set_content("main", render({type: "box", orientation: "vertical", children: [
	{type: "section", id: "demo1"},
	{type: "section", id: "demo2"},
	{type: "section", id: "demo3"},
	{type: "split", orientation: "horizontal"},
	{type: "split", orientation: "vertical"},
]}));

on("dragstart", "section", e => {
	console.log("Dragging", e.match.id);
	e.dataTransfer.setData("application/prs.obs-rc-section", e.match.id);
	e.dataTransfer.setData("text/plain", "[OBS Remote Control section, drag/drop to manage layout]");
	e.dataTransfer.effectAllowed = "copyMove";
});

on("dragend", "section", e => {
	console.log("Dragging complete", e.match.id);
	console.log("Effect:", e.dataTransfer.dropEffect);
});
