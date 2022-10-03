import {choc, DOM, set_content} from "https://rosuav.github.io/choc/factory.js";
const {DIV, IFRAME, LI, P, SECTION, UL} = choc; //autoimport

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

export const rendered_layout = [];
console.log(rendered_layout)

function build(layout, parent, self) {
	console.log("Build", layout);
	let ret = null;
	const layoutidx = rendered_layout.length;
	rendered_layout.push(layout);
	switch (layout.type) {
		//A box has 2+ children and lays them out with a horizontal or vertical flexbox.
		case "box": ret = DIV({
			class: "box " + (layout.orientation === "vertical" ? "vertical" : "horizontal"),
		}, layout.children.map((l,i) => build(l, layoutidx, i)));
		break;
		//A splitbar has precisely two children (either or both of which can be null),
		//and renders them as left+right or top+bottom depending on orientation.
		case "split": {
			const children = layout.children.map((l,i) => build(l, layoutidx, i));
			//Use the saved split bar position, defaulting to 50% if none set
			children[0].style[layout.orientation === "vertical" ? "height" : "width"] =
				typeof layout.splitpos === "number" ? layout.splitpos + "px" : "50%";
			ret = DIV({
				class: "draggable split " + (layout.orientation === "vertical" ? "vertical" : "horizontal"),
			}, [
				children[0],
				DIV({class: "splitbar"}),
				children[1],
			]);
			break;
		}
		//A section provides a standard element.
		case "section": ret = SECTION({id: layout.id, class: "draggable droptarget"}, sections[layout.id](layout)); break;
		case "master": ret = DIV(build(layout.children[0], layoutidx, 0)); break;
		case "shadow": ret = DIV({class: "shadow droptarget"}); break;
		case "iframe":
			if (layout.titlebar || 1) { //Or if we're in edit mode - always have title bar while editing
				ret = DIV({class: "box vertical draggable"}, [
					DIV({class: "titlebar"}, layout.title || layout.src || "Embedded Web Page"),
					IFRAME({src: layout.src || "iframedemo.html"}),
				]);
			}
			else ret = IFRAME({src: layout.src || "iframedemo.html", class: "draggable"});
			break;
		default: break;
	}
	if (!ret) ret = DIV({class: "droptarget", style: "width: 100%; height: 100%"}); //Empty slot in a split or master
	ret.dataset.parentidx = parent;
	ret.dataset.selfidx = self;
	if (ret.classList.contains("draggable")) {
		ret.draggable = true;
		ret.dataset.draglayout = JSON.stringify(layout);
	}
	return ret;
}
export function render(layout) {
	console.log("Render", layout);
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
