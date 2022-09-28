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

let shadow = null;

function remove_shadow_from(elem) {
	//Removing a shadow comes in a few forms.
	//1) If this is a shadow, return a null object.
	//2) If this is a box:
	//2a) If it has one child, return that child with its shadow removed.
	//    (Shouldn't happen. A box should always have multiple children.)
	//2b) If it has two children, one shadow and one not, return the other child.
	//2c) Otherwise, filter out any shadows from the children, and keep the box.
	//    Recursively remove shadows from the remaining children.
	//3) If this has any other children, remove shadows from each child, keeping
	//   their positions unchanged.
	return elem;
}
function remove_shadow() {
	//Shine a nice bright light on the rendered layout, removing any shadow we come across
	//Assumes that rendered_layout[0] is the master object.
	rendered_layout[0] = remove_shadow_from(rendered_layout[0]);
}

on("dragenter", ".droptarget", e => e.preventDefault());
on("dragover", ".droptarget", e => {
	if (e.defaultPrevented) return;
	//Checking the transfer data somehow doesn't work in Chrome, but does in
	//Firefox. For now, just let whatever happen, and deal with it in the
	//Drop event below.
	//const id = e.dataTransfer.getData("application/prs.obs-rc-section");
	//if (!id) return;
	e.preventDefault();
	//console.log(e.dataTransfer.effectAllowed, e.dataTransfer.dropEffect, id);
	//e.dataTransfer.dropEffect = "move";
	console.log(rendered_layout)
	const {parentidx, selfidx} = e.match.dataset;
	if (shadow) return;
	const cur = rendered_layout[parentidx].children[selfidx].type; //Could be undefined
	if (cur === "shadow") return; //Already a shadow there.
	if (!cur) rendered_layout[parentidx].children[selfidx] = shadow = {type: "shadow"}; //Replace a lack of element with a shadow.
	else {
		//Add a shadow here. TODO: All the different options.
		rendered_layout[parentidx].children[selfidx] = {
			type: "box", orientation: "vertical",
			children: [
				rendered_layout[parentidx].children[selfidx],
				shadow = {type: "shadow"},
			],
		};
	}
	set_content("main", render(rendered_layout[0].children[0]));
});

on("dragleave", ".droptarget", e => {
	console.log("Drag leave!");
});

on("drop", ".droptarget", e => {
	if (e.defaultPrevented) return;
	console.log(e);
	e.preventDefault();
	const id = e.dataTransfer.getData("application/prs.obs-rc-section");
	console.log("ID to insert:", id);
	if (!shadow) return;
	//TODO: If dropping something other than a section (eg a split), assign something else
	Object.assign(shadow, {type: "section", id});
	shadow = null;
	set_content("main", render(rendered_layout[0].children[0]));
});
