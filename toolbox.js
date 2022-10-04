import {choc, DOM, set_content} from "https://rosuav.github.io/choc/factory.js";
const {} = choc; //autoimport
import {render, startdrag} from "./sections.js";

set_content("main", render({type: "box", subtype: "vertical", children: [
	{type: "section", subtype: "demo1"},
	{type: "section", subtype: "demo2"},
	{type: "section", subtype: "demo3"},
	{type: "split", subtype: "horizontal", children: [{}, {}]},
	{type: "split", subtype: "vertical", children: [{}, {}]},
	{type: "iframe"},
]}, true));

on("dragstart", ".draggable", e => startdrag(e));
