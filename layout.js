import {choc, DOM, set_content, fix_dialogs} from "https://rosuav.github.io/choc/factory.js";
const {INPUT, LABEL, OPTION, P, SELECT, TABLE, TD, TR} = choc; //autoimport
import {render, rendered_layout, startdrag, get_basis_object, add_element_dropdown, safe_parse_element} from "./sections.js";
import {simpleconfirm} from "./stillebot_utils.js";

let editmode = false, toolboxwin;
let all_layouts = [{label: "Layout 1", content: { }}];
let curlayout = 0; //Index into all_layouts
let layout_override = null; //If present, will be rendered instead of regular layout

function set_edit_mode(m) {
	if (layout_override) return;
	editmode = m;
	if (!editmode && toolboxwin) toolboxwin.close();
	set_content("main", render(rendered_layout[0].children[0], editmode));
	set_content("#layoutmode", editmode ? "Save layout" : "Edit");
	document.body.classList.toggle("editmode", editmode);
}
DOM("#layoutmode").onclick = e => {set_edit_mode(!editmode); remove_shadow();}
DOM("#cancel").onclick = e => {set_edit_mode(false); rerender();} //Don't remove_shadow which would save
DOM("#opentoolbox").onclick = e => toolboxwin = window.open("toolbox.html", "toolbox", "popup=1,width=300,height=650");

function rebuild_layout_dropdown() {
	if (curlayout < 0 || curlayout >= all_layouts.length) curlayout = 0;
	set_content("#layoutselect", [
		all_layouts.map((l, i) => OPTION({value: i}, l.label)),
		OPTION({value: "-1"}, "- add layout -"),
	]).value = curlayout;
}

function rerender() {
	let layouts = JSON.parse(localStorage.getItem("obs-remote-layouts") || "null");
	if (!layouts) layouts = [{label: "Default", content: {
		type: "box", subtype: "vertical", children: [
			{type: "section", subtype: "sceneswitch"},
			{type: "box", subtype: "horizontal", children: [
				{type: "section", subtype: "mixer", flexsize: "fitcontent"},
				{type: "section", subtype: "streamstatus"},
			]},
		],
	}}, {label: "Scenes", content: {
		type: "box", subtype: "vertical", children: [
			{type: "section", subtype: "sceneswitch"},
		],
	}}, {label: "Audio", content: {
		type: "box", subtype: "vertical", children: [
			{type: "section", subtype: "mixer"},
		],
	}}, {label: "Split", content: {
		type: "split", subtype: "vertical", active: true, children: [
			{type: "section", subtype: "sceneswitch"},
			{type: "box", subtype: "horizontal", children: [
				{type: "section", subtype: "mixer", flexsize: "fitcontent"},
				{type: "section", subtype: "streamstatus"},
			]},
		],
	}}];
	//If you delete all layouts, leave one empty layout behind (don't return to the defaults above)
	if (!layouts.length) layouts.push({content: { }});
	if (Array.isArray(layouts)) all_layouts = layouts.map((l,i) => ({type: "layout", label: "Layout " + (i+1), content: { }, ...l}));
	rebuild_layout_dropdown();
	if (layout_override) editmode = false;
	set_content("main", render(layout_override || all_layouts[curlayout].content, editmode));
}
on("change", "#layoutselect", e => {
	if (layout_override) return;
	const idx = +e.match.value;
	if (idx === -1) {
		//Scan layouts for the highest number in "Layout N" format and use
		//the next. That avoids weirdness if you have L1, L2, L3, and then
		//you delete L2 and create another; if we used the array length,
		//we'd make L1, L3, L3, but this way, we make L1, L3, L4. (But why
		//would you ever delete L2? That's where JWST is hanging out!)
		let next = 1;
		all_layouts.forEach(l => {
			const m = /^Layout ([0-9]+)$/.exec(l.label);
			if (m && +m[1] >= next) next = +m[1] + 1;
		});
		curlayout = all_layouts.push({type: "layout", label: "Layout " + next, content: { }}) - 1;
		rebuild_layout_dropdown();
		//Note that we don't save here. If you immediately cancel editing, it will go
		//back to how it was, without the new (empty) layout.
		set_edit_mode(true); remove_shadow();
	}
	else curlayout = idx;
	set_content("main", render(layout_override || all_layouts[curlayout].content, editmode));
});
export function override_layout(layout) { //Set to null to unoverride
	document.body.classList.toggle("layoutoverride", !!layout);
	layout_override = layout;
	rerender();
}

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
	if (!editmode) {
		all_layouts[curlayout].content = layout;
		localStorage.setItem("obs-remote-layouts", JSON.stringify(all_layouts));
	}
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
	//const layout = e.dataTransfer.getData("text/plain");
	//if (!layout) return;
	e.preventDefault();
	//console.log(e.dataTransfer.effectAllowed, e.dataTransfer.dropEffect, id);
	//e.dataTransfer.dropEffect = "move";
	const {parentidx, selfidx} = e.match.dataset;
	const cur = rendered_layout[parentidx].children[selfidx].type; //Could be undefined
	if (cur === "shadow") return; //Already a shadow there.
	if (!cur) rendered_layout[parentidx].children[selfidx] = {type: "newshadow"}; //Replace a lack of element with a shadow.
	else {
		//Add a shadow adjacent to this element.
		//First, find out which side the mouse cursor is nearest to.
		const box = e.match.getBoundingClientRect();
		//Measure distance to edges: left, top, right, bottom (proportions, not pixels)
		const edges = [
			(e.clientX - box.left) / box.width,
			(e.clientY - box.top) / box.height,
			(box.right - e.clientX) / box.width,
			(box.bottom - e.clientY) / box.height,
		];
		let nearest = 0;
		for (let i = 1; i < edges.length; ++i)
			if (edges[i] < edges[nearest]) nearest = i;
		//nearest is now 0/1/2/3 for left/top/right/bottom
		if (
			//If the section is inside a box of the appropriate orientation,
			//insert the new element into the existing box.
			rendered_layout[parentidx].type === "box" &&
				(rendered_layout[parentidx].subtype === "vertical")
				=== ((nearest&1) === 1)
		) {
			rendered_layout[parentidx].children.splice(+selfidx + (nearest > 1), 0, {type: "newshadow"});
		}
		//Otherwise create a box of the appropriate orientation and put both elements into it.
		else {
			const chld = [{type: "newshadow"}, rendered_layout[parentidx].children[selfidx]];
			if (nearest > 1) chld.reverse();
			rendered_layout[parentidx].children[selfidx] = {
				type: "box", subtype: (nearest&1) ? "vertical" : "horizontal",
				children: chld,
			};
		}
	}
	remove_shadow(); //Make sure there aren't multiple shadows
});

on("dragleave", ".droptarget", e => editmode && remove_shadow());

on("drop", ".droptarget", e => {
	if (!editmode || e.defaultPrevented) return;
	e.preventDefault();
	if (!shadow) return;
	try {
		let elem = JSON.parse(e.dataTransfer.getData("text/plain") || "{}");
		elem = safe_parse_element(elem);
		//SPECIAL CASE: If you drop a brand new empty split bar into a box of the
		//correct orientation, replace the box and put the children into the split.
		if (elem.type === "split" && e.match.classList.contains("shadow")) { //If we're not dropping onto a shadow, something's wrong
			const {parentidx, selfidx} = e.match.dataset;
			const parent = rendered_layout[parentidx];
			if (parent.type === "box" && elem.subtype === parent.subtype) {
				const box = e.match.parentElement.getBoundingClientRect();
				const size = elem.subtype === "vertical" ? box.height : box.width;
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
					{type: "box", subtype: elem.subtype, children: left},
					{type: "box", subtype: elem.subtype, children: right},
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
	//NOTE: Pointer capture doesn't seem to work with touch dragging. No idea why.
	//Might be worth delving into what pointerId is, but for now, split bar movement
	//is a bit clunky on mobile. (It's not a Chrome version issue or anything; when
	//a USB mouse is plugged in, it's fully capable of moving split bars just fine.)
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
	const splitbox = e.match.parentElement;
	const {parentidx, selfidx} = splitbox.dataset;
	const box = splitbox.getBoundingClientRect();
	const splitpos = splitvert ? e.clientY - box.top - splitorigin
			: e.clientX - box.left - splitorigin;
	const layout = rendered_layout[parentidx].children[selfidx];
	layout.splitpos = splitpos;
	if (splitbox.draggable) splitbox.dataset.draglayout = JSON.stringify(layout);
	if (!editmode) {
		all_layouts[curlayout].content = rendered_layout[0].children[0];
		localStorage.setItem("obs-remote-layouts", JSON.stringify(all_layouts));
	}
	splitvert = null;
});

//Settings dialog
//Note that the buttons technically exist, but are invisible, on the toolbox. There's no code on them.
let settings_layout = null;
on("click", ".settings,.layoutsettings", e => {
	const {parentidx, selfidx} = e.match.closest("[data-parentidx]").dataset;
	const layout = settings_layout = parentidx < 0 ? all_layouts[curlayout] : rendered_layout[parentidx].children[selfidx];
	const basis = get_basis_object(layout) || { };
	set_content("#settingsdlg h3", basis.title ? "Settings for " + basis.title : "Settings");
	let config = TABLE([
		layout.type !== "layout" && TR([
			TD(LABEL({for: "settings_flexsize"}, "Section size")),
			TD(SELECT({id: "settings_flexsize", value: layout.flexsize}, [
				OPTION({value: ""}, "Expand as needed"),
				OPTION({value: "fitcontent"}, "Fit to content"),
			])),
		]),
		Object.entries(basis.config || { }).map(([key, [desc, dflt]]) => TR([
			TD(LABEL({for: "settings_" + key}, desc)),
			TD(
				typeof dflt === "boolean" ? INPUT({type: "checkbox", id: "settings_" + key, checked: typeof layout[key] === "boolean" ? layout[key] : dflt})
				: typeof dflt === "number" ? INPUT({type: "number", id: "settings_" + key, value: typeof layout[key] === "number" ? layout[key] : dflt})
				: INPUT({id: "settings_" + key, value: typeof layout[key] === "string" ? layout[key] : dflt})
			),
		])),
	]);
	if (basis.settingsdlg) config = basis.settingsdlg(layout, config);
	if (!config) config = P("Component has no configuration settings."); //Try to avoid this where possible
	set_content("#settings_inner", config);
	DOM("#settingsdlg").showModal();
});

DOM("#settingsform").onsubmit = e => {
	const layout = settings_layout; settings_layout = null;
	const basis = get_basis_object(layout) || { };
	if (basis.config) Object.entries(basis.config).forEach(([key, [desc, dflt]]) =>
		layout[key] =
			typeof dflt === "boolean" ? DOM("#settings_" + key).checked
			: typeof dflt === "number" ? +DOM("#settings_" + key).value
			: DOM("#settings_" + key).value
	);
	if (layout.type !== "layout") layout.flexsize = DOM("#settings_flexsize").value;
	else rebuild_layout_dropdown(); //Note that the dropdown is invisible until you save or cancel editing
	if (basis.savesettings) basis.savesettings(layout);
	DOM("#settingsdlg").close();
	remove_shadow();
};

DOM("#settingsdelete").onclick = e => {
	DOM("#settingsdlg").close();
	const layout = settings_layout; settings_layout = null;
	if (layout.type === "layout") return simpleconfirm("Really delete this layout? Cannot be undone!", e => {
		//Delete the entire layout. This removes us from edit mode.
		all_layouts.splice(curlayout, 1);
		localStorage.setItem("obs-remote-layouts", JSON.stringify(all_layouts));
		set_edit_mode(false);
		rerender();
	})();
	layout.type = "shadow"; //Deletion is easy. Just fade it out, then fade shadows to nothing!
	remove_shadow();
};

on("change", ".addelem", e => {
	const {parentidx, selfidx} = e.match.closest("[data-parentidx]").dataset;
	let layout = rendered_layout[parentidx].children[selfidx];
	const parts = e.match.value.split("_");
	e.match.value = "";
	if (!parts[0]) return; //Selection cancelled, empty type
	if (layout.type === "box")
		//Add ourselves to an existing box. Vertical boxes get the new thing inserted
		//into the top (the start of the array), horizontal get it appended to the right.
		layout.children[layout.subtype === "vertical" ? "unshift" : "push"](layout = { });
	else if (layout.type) {
		const orig = layout;
		rendered_layout[parentidx].children[selfidx] = {
			type: "box", subtype: "vertical",
			children: [layout = { }, orig],
		};
	}
	//Else there's no current element, so replace it.
	Object.assign(layout, safe_parse_element({type: parts[0], subtype: parts[1]}));
	remove_shadow();
});
DOM("body > header").appendChild(add_element_dropdown());
