import {choc, DOM, set_content} from "https://rosuav.github.io/choc/factory.js";
const {} = choc; //autoimport
import {render, startdrag} from "./sections.js";

//TODO: Spawn entries for every section not in the main layout
//plus one for Horizontal Split, one for Vertical Split

set_content("main", render({type: "box", orientation: "vertical", children: [
	{type: "section", id: "demo1"},
	{type: "section", id: "demo2"},
	{type: "section", id: "demo3"},
	{type: "split", orientation: "horizontal", children: [{}, {}]},
	{type: "split", orientation: "vertical", children: [{}, {}]},
	{type: "iframe"},
]}, true));

on("dragstart", ".draggable", e => startdrag(e));
on("dragend", "section", e => {
	console.log("Dragging complete", e.match.id);
	console.log("Effect:", e.dataTransfer.dropEffect);
	//TODO: Wait long enough that Local Storage should have been updated by the other page,
	//then rerender based on what isn't currently being used.
});
