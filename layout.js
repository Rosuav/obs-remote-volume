import {choc, DOM, set_content, fix_dialogs} from "https://rosuav.github.io/choc/factory.js";
const {INPUT, LABEL, P, TABLE, TD, TR} = choc; //autoimport
import {render, rendered_layout, startdrag, get_basis_object} from "./sections.js";
fix_dialogs({close_selector: ".dialog_cancel,.dialog_close", click_outside: true});

let editmode = false, toolboxwin;

DOM("#layoutmode").onclick = e => {
	editmode = !editmode;
	if (!editmode && toolboxwin) toolboxwin.close();
	set_content("main", render(rendered_layout[0].children[0], editmode));
	set_content("#layoutmode", editmode ? "Save layout" : "Edit");
	document.body.classList.toggle("editmode", editmode);
	remove_shadow(); //and save (if no longer editing)
};
DOM("#cancel").onclick = e => {
	editmode = false;
	if (toolboxwin) toolboxwin.close();
	rerender();
	set_content("#layoutmode", "Edit");
	document.body.classList.remove("editmode");
};
DOM("#opentoolbox").onclick = e => toolboxwin = window.open("toolbox.html", "toolbox", "popup=1,width=300,height=650");

function rerender() {
	const layout = localStorage.getItem("obs-remote-layout") || "{}";
	set_content("main", render(JSON.parse(layout), editmode));
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
	const layout = remove_shadow_from(rendered_layout[0].children[0]);
	set_content("main", render(layout, editmode));
	if (!editmode) localStorage.setItem("obs-remote-layout", JSON.stringify(layout));
}

on("dragstart", ".draggable", e => {
	e.stopPropagation();
	startdrag(e);
	const {parentidx, selfidx} = e.match.dataset;
	//Replace the current element with a shadow, thus (effectively) removing it.
	rendered_layout[parentidx].children[selfidx] = {type: "newshadow"};
	setTimeout(remove_shadow, 0); //Don't remove the element while we're handling the event
});

on("dragenter", ".droptarget", e => editmode && e.preventDefault());
on("dragover", ".droptarget", e => {
	if (!editmode || e.defaultPrevented) return;
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

on("dragleave", ".droptarget", e => editmode && remove_shadow());

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
		case "box":
			if (!Array.isArray(elem.children) || elem.children.length < 2) return { };
			return {
				type: "box",
				orientation: elem.orientation === "vertical" ? "vertical" : "horizontal",
				children: elem.children.map(safe_parse_element),
			};
		case "iframe": return {
			type: "iframe",
			titlebar: !!elem.titlebar,
			title: typeof elem.title === "string" ? elem.title : null,
			src: typeof elem.src === "string" ? elem.src : null,
			id: (""+Math.random()).replace("0.", "iframe_"), //Generate an ID which the user may subsequently edit if desired
		};
		default: break;
	}
	return { };
}

on("drop", ".droptarget", e => {
	if (!editmode || e.defaultPrevented) return;
	console.log(e);
	e.preventDefault();
	if (!shadow) return;
	try {
		let elem = JSON.parse(e.dataTransfer.getData("application/prs.obs-rc-element") || "{}");
		console.log("Dropping:", elem);
		elem = safe_parse_element(elem);
		//SPECIAL CASE: If you drop a brand new empty split bar into a box of the
		//correct orientation, replace the box and put the children into the split.
		if (elem.type === "split" && e.match.classList.contains("shadow")) { //If we're not dropping onto a shadow, something's wrong
			const {parentidx, selfidx} = e.match.dataset;
			const parent = rendered_layout[parentidx];
			if (parent.type === "box" && elem.orientation === parent.orientation) {
				const box = e.match.parentElement.getBoundingClientRect();
				const size = elem.orientation === "vertical" ? box.height : box.width;
				//(These could be "top" and "bottom" but same difference)
				const left = parent.children.slice(0, selfidx);
				const right = parent.children.slice(+selfidx + 1);
				//If the split bar is at one end or the other, allow one slot of
				//extra space that side. Other than that, divide the available
				//space according to the current division.
				const nleft = left.length || 1, nright = right.length || 1;
				//Okay. Let's turn this box into a splitbox.
				parent.type = "split";
				parent.splitpos = size * nleft / (nleft + nright);
				parent.children = [
					//These boxes could be empty, or contain only one child. It'll get
					//cleaned up by remove_shadow().
					{type: "box", orientation: elem.orientation, children: left},
					{type: "box", orientation: elem.orientation, children: right},
				];
				shadow = null; //Okay! We're done.
			}
		}
		if (shadow) Object.assign(shadow, elem);
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
	e.match.parentElement.firstElementChild.style[splitvert ? "height" : "width"] = splitpos + "px";
});
on("pointerup", ".splitbar", e => {
	//Record splitpos as this split bar's new official position
	e.match.releasePointerCapture(e.pointerId);
	splitvert = null;
	const splitbox = e.match.parentElement;
	const {parentidx, selfidx} = splitbox.dataset;
	const box = splitbox.getBoundingClientRect();
	const splitpos = splitvert ? e.clientY - box.top - splitorigin
			: e.clientX - box.left - splitorigin;
	const layout = rendered_layout[parentidx].children[selfidx];
	layout.splitpos = splitpos;
	if (splitbox.draggable) splitbox.dataset.draglayout = JSON.stringify(layout);
	if (!editmode) localStorage.setItem("obs-remote-layout", JSON.stringify(rendered_layout[0].children[0]));
});

//Settings dialog
//Note that the buttons technically exist, but are invisible, on the toolbox. There's no code on them.
let settings_layout = null;
on("click", ".settings", e => {
	const {parentidx, selfidx} = e.match.closest("[data-parentidx]").dataset;
	const layout = settings_layout = rendered_layout[parentidx].children[selfidx];
	const basis = get_basis_object(layout) || { };
	set_content("#settingsdlg h3", basis.title ? "Settings for " + basis.title : "Settings");
	let config = basis.config && TABLE(Object.entries(basis.config).map(([key, [desc, dflt]]) => TR([
		TD(LABEL({for: "settings_" + key}, desc)),
		TD(INPUT({id: "settings_" + key, value: typeof layout[key] === "string" ? layout[key] : dflt})),
	])));
	if (basis.settingsdlg) config = basis.settingsdlg(layout, config);
	if (!config) config = P("Component has no configuration settings."); //Try to avoid this where possible
	set_content("#settingsinner", config);
	DOM("#settingsdlg").showModal();
});

DOM("#settingssave").onclick = e => {
	const layout = settings_layout; settings_layout = null;
	const basis = get_basis_object(layout) || { };
	if (basis.config) Object.keys(basis.config).forEach(key => layout[key] = DOM("#settings_" + key).value);
	if (basis.savesettings) basis.savesettings(layout);
	DOM("#settingsdlg").close();
	remove_shadow();
};

DOM("#settingsdelete").onclick = e => {
	const layout = settings_layout; settings_layout = null;
	layout.type = "shadow"; //Deletion is easy. Just fade it out, then fade shadows to nothing!
	DOM("#settingsdlg").close();
	remove_shadow();
};
