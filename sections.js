import {choc, DOM, set_content} from "https://rosuav.github.io/choc/factory.js";
const {BUTTON, DIV, IFRAME, LI, P, SECTION, UL} = choc; //autoimport

const sections = {
	demo1: cfg => [
		P("Drag this thing!"),
		UL("Test list with a number of elements".split(" ").map(w => LI(w))),
	],
	demo2: cfg => [
		P("Or drag this thing instead!"),
	],
	demo3: cfg => [
		P("Here's a third thing to play with."),
	],
};

const typename = {
	split: "Split bar", iframe: "Embedded Web Page",
	demo1: "Demo With List",
	demo2: "Hey Look, A Thing",
	demo3: "Another Thing",
};

export const rendered_layout = [];
console.log(rendered_layout)

let editmode = false;
function build(layout, parent, self) {
	let ret = null, tb = editmode, drag = editmode;
	let deftitle = null;
	const layoutidx = rendered_layout.length;
	rendered_layout.push(layout);
	switch (layout.type) {
		//A box has 2+ children and lays them out with a horizontal or vertical flexbox.
		case "box": ret = DIV({
			class: "box " + (layout.orientation === "vertical" ? "vertical" : "horizontal"),
		}, layout.children.map((l,i) => build(l, layoutidx, i)));
		tb = drag = false;
		break;
		//A splitbar has precisely two children (either or both of which can be null),
		//and renders them as left+right or top+bottom depending on orientation.
		case "split": {
			const children = layout.children.map((l,i) => build(l, layoutidx, i));
			//Use the saved split bar position, defaulting to 50% if none set
			children[0].style[layout.orientation === "vertical" ? "height" : "width"] =
				typeof layout.splitpos === "number" ? layout.splitpos + "px" : "50%";
			ret = DIV({
				class: "split " + (layout.orientation === "vertical" ? "vertical" : "horizontal"),
			}, [
				children[0],
				DIV({class: "splitbar"}),
				children[1],
			]);
			break;
		}
		case "section":
			ret = SECTION({id: layout.id, class: "droptarget"}, sections[layout.id](layout));
			deftitle = typename[layout.id] || "Section";
			break;
		case "master": ret = DIV(build(layout.children[0], layoutidx, 0)); tb = drag = false; break;
		case "shadow": ret = DIV({class: "shadow droptarget"}); tb = drag = false; break;
		case "iframe":
			//Reuse the iframe where possible.
			ret = DOM("#" + layout.id) || IFRAME({id: layout.id, src: layout.src || "iframedemo.html"});
			if (layout.titlebar) {tb = true; deftitle = ret.contentDocument.title;}
			break;
		default: break;
	}
	if (!ret) {ret = DIV({class: "droptarget", style: "width: 100%; height: 100%"}); tb = drag = false;} //Empty slot in a split or master
	ret.dataset.parentidx = parent;
	ret.dataset.selfidx = self;
	if (tb) { //Some elements have titlebars in edit mode. It's possible for them to have them in layout mode too.
		ret = DIV({class: "box vertical"}, [
			DIV({class: "titlebar"}, [
				layout.title || deftitle || typename[layout.type] || layout.type || "Element",
				BUTTON({type: "button", class: "settings"}, "⚙"),
			]),
			ret,
		]);
		ret.dataset.parentidx = parent;
		ret.dataset.selfidx = self;
	}
	if (drag) { //Items are only ever draggable during edit mode. Some still aren't, even then.
		ret.classList.add("draggable");
		ret.draggable = true;
		ret.dataset.draglayout = JSON.stringify(layout);
	}
	return ret;
}
export function render(layout, editing) {
	console.log("Render", layout);
	editmode = editing;
	rendered_layout[0] = {type: "master", children: [layout]};
	rendered_layout.length = 1; //Truncate the array
	return build(layout, 0, 0);
}

export function startdrag(e, layout) {
	if (!layout) layout = e.match.dataset.draglayout;
	e.dataTransfer.setData("application/prs.obs-rc-element", layout);
	e.dataTransfer.setData("text/plain", "[OBS Remote Control element, drag/drop to manage layout]");
	e.dataTransfer.effectAllowed = "copyMove";
}
