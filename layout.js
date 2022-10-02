import {choc, DOM, set_content} from "https://rosuav.github.io/choc/factory.js";
const {} = choc; //autoimport
import {render, rendered_layout, startdrag} from "./sections.js";

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
	//Removing a shadow comes in a few forms. This never mutates; it either
	//returns an existing object (not necessarily elem itself) unchanged,
	//or a new object.
	//1) If this is a shadow, return a null object. But if it's a new shadow,
	//   keep it (as a regular shadow).
	if (elem.type === "shadow") return { };
	if (elem.type === "newshadow") return shadow = {type: "shadow"};
	//2) If this is a box:
	if (elem.type === "box") switch (elem.children.length) {
		//2a) If it has one child, return that child with its shadow removed.
		//    (Shouldn't happen. A box should always have multiple children.)
		case 0: return { };
		case 1: return remove_shadow_from(elem.children[0]);
		//2b) If it has two children, one shadow and one not, return the other child.
		case 2:
			if (elem.children[0].type === "shadow") return remove_shadow_from(elem.children[1]);
			if (elem.children[1].type === "shadow") return remove_shadow_from(elem.children[0]);
			//Else fall through
		default:
			//2c) Otherwise, filter out any shadows from the children, and keep the box.
			//    Recursively remove shadows from the remaining children.
			return {...elem, children: elem.children.filter(c => c.type !== "shadow").map(remove_shadow_from)};
	}
	//3) If this has any other children, remove shadows from each child, keeping
	//   their positions unchanged. Note the distinction from 2c above; with a
	//   box, collapse out shadows and shorten the array, but with other types,
	//   keep a null entry. This allows a splitbox to have precisely two children
	//   at all times, and removing an element from one side won't move the other
	//   element across (which would be VERY annoying).
	if (elem.children) return {...elem, children: elem.children.map(remove_shadow_from)};
	return elem;
}
function remove_shadow() {
	//Shine a nice bright light on the rendered layout, removing any shadow we come across
	//Assumes that rendered_layout[0] is the master object.
	set_content("main", render(remove_shadow_from(rendered_layout[0].children[0])));
}

on("dragstart", ".draggable", e => {
	//TODO: If you drag a splitbox, ensure that the children AND the split position
	//move as a single unit.
	startdrag(e);
	const {parentidx, selfidx} = e.match.dataset;
	//Replace the current element with a shadow, thus (effectively) removing it.
	rendered_layout[parentidx].children[selfidx] = {type: "newshadow"};
	setTimeout(remove_shadow, 0); //Don't remove the element while we're handling the event
});

on("dragenter", ".droptarget", e => e.preventDefault());
on("dragover", ".droptarget", e => {
	if (e.defaultPrevented) return;
	//Checking the transfer data somehow doesn't work in Chrome, but does in
	//Firefox. For now, just let whatever happen, and deal with it in the
	//Drop event below.
	//const layout = e.dataTransfer.getData("application/prs.obs-rc-element");
	//if (!layout) return;
	e.preventDefault();
	//console.log(e.dataTransfer.effectAllowed, e.dataTransfer.dropEffect, id);
	//e.dataTransfer.dropEffect = "move";
	const {parentidx, selfidx} = e.match.dataset;
	//console.log("Drag over", parentidx, selfidx, JSON.parse(JSON.stringify(rendered_layout)));
	const cur = rendered_layout[parentidx].children[selfidx].type; //Could be undefined
	if (cur === "shadow") return; //Already a shadow there.
	if (!cur) rendered_layout[parentidx].children[selfidx] = {type: "newshadow"}; //Replace a lack of element with a shadow.
	else {
		//Add a shadow adjacent to this element.
		//First, find out which side the mouse cursor is nearest to.
		const box = e.match.getBoundingClientRect();
		//Measure distance to edges: left, top, right, bottom
		const edges = [
			e.clientX - box.left,
			e.clientY - box.top,
			box.right - e.clientX,
			box.bottom - e.clientY,
		];
		let nearest = 0;
		for (let i = 1; i < edges.length; ++i)
			if (edges[i] < edges[nearest]) nearest = i;
		//nearest is now 0/1/2/3 for left/top/right/bottom
		console.log(["Left", "Top", "Right", "Bottom"][nearest]);
		if (
			//If the section is inside a box of the appropriate orientation,
			//insert the new element into the existing box.
			rendered_layout[parentidx].type === "box" &&
				(rendered_layout[parentidx].orientation === "vertical")
				=== ((nearest&1) === 1)
		) {
			console.log("MATCHING BOX", selfidx, +selfidx + (nearest > 1));
			rendered_layout[parentidx].children.splice(+selfidx + (nearest > 1), 0, {type: "newshadow"});
		}
		//Otherwise create a box of the appropriate orientation and put both elements into it.
		else {
			const chld = [{type: "newshadow"}, rendered_layout[parentidx].children[selfidx]];
			if (nearest > 1) chld.reverse();
			console.log("NONMATCHING", JSON.parse(JSON.stringify(chld)));
			rendered_layout[parentidx].children[selfidx] = {
				type: "box", orientation: (nearest&1) ? "vertical" : "horizontal",
				children: chld,
			};
		}
		console.log("After insertion:", JSON.parse(JSON.stringify(rendered_layout)));
	}
	remove_shadow(); //Make sure there aren't multiple shadows
});

on("dragleave", ".droptarget", e => {
	remove_shadow();
});

function safe_parse_element(elem) {
	//Parse an untrusted element object and return something which,
	//if possible, represents the original intention
	if (typeof elem !== "object") return { };
	switch (elem.type) {
		case "section": return {type: "section", id: elem.id};
		case "split": return {
			type: "split",
			orientation: elem.orientation === "vertical" ? "vertical" : "horizontal",
			splitpos: typeof elem.splitpos === "number" ? elem.splitpos : null,
			children: Array.isArray(elem.children) ? [
				safe_parse_element(elem.children[0]),
				safe_parse_element(elem.children[1]),
			] : [{}, {}],
		};
		default: break;
	}
	return { };
}

on("drop", ".droptarget", e => {
	if (e.defaultPrevented) return;
	console.log(e);
	e.preventDefault();
	if (!shadow) return;
	try {
		const elem = JSON.parse(e.dataTransfer.getData("application/prs.obs-rc-element") || "{}");
		console.log("Dropping:", elem);
		Object.assign(shadow, safe_parse_element(elem));
	}
	catch (e) {
		//Shouldn't normally happen, but in case it does, dump it to the console.
		console.warn("Bad parse");
		console.warn(e);
	}
	shadow = null;
	remove_shadow();
});

//Split bar dragging
let splitorigin = 0, splitvert = null;
on("pointerdown", ".splitbar", e => {
	if (e.button) return; //Only left clicks
	e.preventDefault();
	e.match.setPointerCapture(e.pointerId);
	splitvert = e.match.parentElement.classList.contains("vertical");
	const box = e.match.getBoundingClientRect();
	if (splitvert) splitorigin = e.clientY - box.top;
	else splitorigin = e.clientX - box.left;
});
on("pointermove", ".splitbar", e => {
	if (splitvert === null) return; //Not dragging a split bar.
	const box = e.match.parentElement.getBoundingClientRect();
	const splitpos = splitvert ? e.clientY - box.top - splitorigin
			: e.clientX - box.left - splitorigin;
	//TODO: Record splitpos as this split bar's new official position
	e.match.parentElement.firstElementChild.style[splitvert ? "height" : "width"] = splitpos + "px";
});
on("pointerup", ".splitbar", e => {
	e.match.releasePointerCapture(e.pointerId);
	splitvert = null;
});
