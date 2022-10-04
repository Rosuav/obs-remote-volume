import {choc, DOM, set_content} from "https://rosuav.github.io/choc/factory.js";
const {BUTTON, DIV, IFRAME, LI, OPTION, P, SECTION, SELECT, UL} = choc; //autoimport

const definitions = {
	section_demo1: {
		title: "Demo With List",
		render: layout => [
			P("Drag this thing!"),
			UL("Test list with a number of elements".split(" ").map(w => LI(w))),
		],
	},
	section_demo2: {
		title: "Hey Look, A Thing",
		render: layout => [
			P("Or drag this thing instead!"),
		],
	},
	section_demo3: {
		title: "Another Thing",
		render: layout => [
			P("Here's a third thing to play with."),
		],
	},
	split: {
		title: "Split bar",
		config: {
			active: ["Always active", false],
		},
	},
	split_horizontal: {title: "Horizontal split"},
	split_vertical: {title: "Vertical split"},
	iframe: {
		title: "Embedded Web Page",
		//Build a simple settings dialog by providing the layout config keys,
		//their labels, and default values.
		config: {
			src: ["URL", ""],
			id: ["Unique ID", "demo"],
		},
		//If more flexibility is needed, this function can return whatever it
		//needs to - the second arg is whatever was generated from the config
		//above. It will be absent if config itself is absent.
		//settingsdlg: (layout, table) => table,
		//Similarly, extra flexibility on saving of settings can be done with
		//this function, called after the other settings are applied:
		//savesettings: layout => { },
	},
};
//Is this a good use for prototype inheritance? Effectively, split_horizontal inherits from split implicitly.
Object.keys(definitions).forEach(key => {
	const [t, s] = key.split("_");
	if (s && definitions[t]) definitions[key] = Object.assign(Object.create(definitions[t]), definitions[key]);
});
export function get_basis_object(layout) {return definitions[layout.type + "_" + layout.subtype] || definitions[layout.type] || { };}

export const rendered_layout = [];
console.log(rendered_layout)

export const add_element_dropdown = () => SELECT({class: "addelem editonly"}, [
	OPTION({disabled: true, value: "", selected: true}, "Add element"),
	Object.entries(definitions).map(([type, info]) =>
		OPTION({value: type}, info.title)),
	OPTION({value: ""}, "(cancel)"),
]);

let editmode = false;
function build(layout, parent, self) {
	let ret = null, tb = editmode, drag = editmode;
	const basis = definitions[layout.type + "_" + layout.subtype] || definitions[layout.type] || { };
	let deftitle = basis.title;
	const layoutidx = rendered_layout.length;
	rendered_layout.push(layout);
	switch (layout.type) {
		//A box has 2+ children and lays them out with a horizontal or vertical flexbox.
		case "box": ret = DIV({
			class: "box " + (layout.subtype === "vertical" ? "vertical" : "horizontal"),
		}, layout.children.map((l,i) => build(l, layoutidx, i)));
		tb = drag = false;
		break;
		//A splitbar has precisely two children (either or both of which can be null),
		//and renders them as left+right or top+bottom depending on orientation.
		case "split": {
			const children = layout.children.map((l,i) => build(l, layoutidx, i));
			//Use the saved split bar position, defaulting to 50% if none set
			children[0].style[layout.subtype === "vertical" ? "height" : "width"] =
				typeof layout.splitpos === "number" ? layout.splitpos + "px" : "50%";
			ret = DIV({
				class: "split " + (layout.subtype === "vertical" ? "vertical" : "horizontal"),
			}, [
				children[0],
				DIV({class: editmode || layout.active ? "splitbar" : "divider"}),
				children[1],
			]);
			break;
		}
		case "section":
			ret = SECTION({"data-subtype": layout.subtype, class: "droptarget"}, basis.render(layout));
			break;
		case "master": ret = DIV(build(layout.children[0], layoutidx, 0)); tb = drag = false; break;
		case "shadow": ret = DIV({class: "shadow droptarget"}); tb = drag = false; break;
		case "iframe": {
			//Reuse the iframe where possible.
			const defn = JSON.stringify(layout);
			const id = "iframe_" + layout.id;
			ret = DOM("#" + id);
			//For some reason we're still getting a lot of flicker, even though it's
			//correctly reusing the iframe elements. Hmm.
			if (!ret || ret.dataset.defn !== defn)
				//New or changed. Construct a brand-new iframe.
				ret = IFRAME({id, src: layout.src || "iframedemo.html", "data-defn": defn});
			if (layout.titlebar) {tb = true; deftitle = ret.contentDocument.title || deftitle;}
			break;
		}
		default: break;
	}
	if (!ret) {
		//Empty slot in a split or master
		ret = DIV({class: "droptarget", style: "width: 100%; height: 100%"},
			editmode && add_element_dropdown());
		tb = drag = false;
	}
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
