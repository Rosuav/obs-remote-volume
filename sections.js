import {choc, DOM, set_content} from "https://rosuav.github.io/choc/factory.js";
const {BUTTON, DIV, IFRAME, INPUT, LABEL, LI, P, SECTION, TABLE, TD, TR, UL} = choc; //autoimport

const definitions = {
	demo1: {
		title: "Demo With List",
		render: cfg => [
			P("Drag this thing!"),
			UL("Test list with a number of elements".split(" ").map(w => LI(w))),
		],
	},
	demo2: {
		title: "Hey Look, A Thing",
		render: cfg => [
			P("Or drag this thing instead!"),
		],
	},
	demo3: {
		title: "Another Thing",
		render: cfg => [
			P("Here's a third thing to play with."),
		],
	},
	split: {title: "Split bar"},
	iframe: {
		title: "Embedded Web Page",
		settingsdlg: cfg => TABLE([
			TR([TD(LABEL({for: "settings_url"}, "URL")), TD(INPUT({id: "settings_url", value: cfg.url || ""}))]),
		]),
	},
};
export function get_basis_object(layout) {return definitions[layout.id] || definitions[layout.type] || { };}

export const rendered_layout = [];
console.log(rendered_layout)

let editmode = false;
function build(layout, parent, self) {
	let ret = null, tb = editmode, drag = editmode;
	const basis = definitions[layout.id] || definitions[layout.type] || { };
	let deftitle = basis.title;
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
				//TODO: Have a splitbox option to keep the splitbar at runtime
				DIV({class: editmode ? "splitbar" : "divider"}),
				children[1],
			]);
			break;
		}
		case "section":
			ret = SECTION({id: layout.id, class: "droptarget"}, basis.render(layout));
			break;
		case "master": ret = DIV(build(layout.children[0], layoutidx, 0)); tb = drag = false; break;
		case "shadow": ret = DIV({class: "shadow droptarget"}); tb = drag = false; break;
		case "iframe":
			//Reuse the iframe where possible.
			ret = DOM("#" + layout.id) || IFRAME({id: layout.id, src: layout.src || "iframedemo.html"});
			if (layout.titlebar) {tb = true; deftitle = ret.contentDocument.title || deftitle;}
			break;
		default: break;
	}
	if (!ret) {ret = DIV({class: "droptarget", style: "width: 100%; height: 100%"}); tb = drag = false;} //Empty slot in a split or master
	ret.dataset.parentidx = parent;
	ret.dataset.selfidx = self;
	if (tb) { //Some elements have titlebars in edit mode. It's possible for them to have them in layout mode too.
		ret = DIV({class: "box vertical"}, [
			DIV({class: "titlebar"}, [
				layout.title || deftitle || basis.title || "Element",
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
