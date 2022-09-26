import {choc, DOM, set_content} from "https://rosuav.github.io/choc/factory.js";
const {DIV, LI, P, SECTION, UL} = choc; //autoimport

const sections = {
	demo1: cfg => [
		P("Drag this thing!"),
		UL("Test list with a number of elements".split(" ").map(w => LI(w))),
	],
	demo2: cfg => [
		P("Or drag this thing instead!"),
	],
};

export const rendered_layout = [];
console.log(rendered_layout)

function build(layout, parent, self) {
	console.log("Build", layout);
	let ret = null;
	const layoutidx = rendered_layout.push(layout);
	switch (layout.type) {
		//A box has 2+ children and lays them out with a horizontal or vertical flexbox.
		case "box": ret = DIV({
			class: "box " + (layout.orientation === "vertical" ? "vertical" : "horizontal"),
		}, layout.children.map((l,i) => build(l, layoutidx, i)));
		break;
		//A splitbar has precisely two children (either or both of which can be null),
		//and renders them as left+right or top+bottom depending on orientation.
		case "split": ret = DIV("UNIMPLEMENTED: Split " + layout.orientation); break;
		//A section provides a standard element.
		case "section": ret = SECTION({id: layout.id, draggable: "true"}, sections[layout.id](layout)); break;
		case "master": ret = DIV(build(layout.children[0], layoutidx, 0)); break;
		default: break;
	}
	if (!ret) ret = DIV({class: "droptarget", style: "width: 100%; height: 100%"}); //Empty slot in a split or master
	ret.dataset.parentidx = parent;
	ret.dataset.selfidx = self;
	return ret;
}
export function render(layout) {
	console.log("Render", layout);
	rendered_layout[0] = {type: "master", children: [layout]};
	rendered_layout.length = 1; //Truncate the array
	return build(layout, 0, 0);
}
