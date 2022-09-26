import {choc, DOM, set_content} from "https://rosuav.github.io/choc/factory.js";
const {} = choc; //autoimport
import {render, rendered_layout} from "./sections.js";

DOM("#layoutmode").onclick = () => {
	const win = window.open("toolbox.html", "toolbox", "popup=1,width=300,height=650");
	console.log(win)
};

function rerender() {
	const layout = localStorage.getItem("obs-remote-layout") || "{}";
	set_content("main", render(JSON.parse(layout)));
}
rerender();

on("dragenter", ".droptarget", e => e.preventDefault());
on("dragover", ".droptarget", e => {
	//Checking the transfer data somehow doesn't work in Chrome, but does in
	//Firefox. For now, just let whatever happen, and deal with it in the
	//Drop event below.
	//const id = e.dataTransfer.getData("application/prs.obs-rc-section");
	//if (!id) return;
	e.preventDefault();
	//console.log(e.dataTransfer.effectAllowed, e.dataTransfer.dropEffect, id);
	//e.dataTransfer.dropEffect = "move";
});

on("drop", ".droptarget", e => {
	if (e.defaultPrevented) return;
	console.log(e);
	e.preventDefault();
	const id = e.dataTransfer.getData("application/prs.obs-rc-section");
	console.log("ID to insert:", id);
	console.log(e.match);
	const idx = +e.match.dataset.parentidx;
	console.log("Index", idx);
	console.log("Rendered:", rendered_layout[idx]);
	rendered_layout[idx].children[e.match.dataset.selfidx] = {type: "section", id};
	set_content("main", render(rendered_layout[0].children[0]));
});
