import {choc, DOM, set_content} from "https://rosuav.github.io/choc/factory.js";
const {BUTTON, CODE, DETAILS, DIV, H4, IFRAME, INPUT, LABEL, LI, OPTION, P, PRE, SECTION, SELECT, SUMMARY, TABLE, TBODY, TD, TR, UL} = choc; //autoimport

const definitions = {
	section: {
		title: "Unknown section",
		render: layout => [
			P("Oops - it seems something has been renamed or removed."),
			PRE(JSON.stringify(layout, null, 4)),
		],
	},
	section_desc: {
		title: "Description",
		render: layout => [
			P("To use this with your OBS, go to http://vol.rosuav.com/#PASSWORD@COMPUTER where the password "
			+ "is what you've set up in OBS-Remote (ignored if no authentication) and the computer is "
			+ "specified by IP address or computer name."),
			P("When connected to OBS, this will allow you to make fine adjustments to your stream configuration "
			+ "without actually clicking on the OBS main window. This allows you to make adjustments from your "
			+ "laptop or tablet (or possibly even phone), without moving away from what you were doing."),
		],
	},
	section_layoutmgr: {
		title: "Scene details",
		render: layout => [
			DETAILS({class: "hidden"}, [SUMMARY("Layout management"),
				DIV({style: "display: flex"}, [
					DIV({id: "layout"}, "Not rendering the layout (you shouldn't normally see this text)"),
					DIV({id: "layout_info"}, [
						H4("Scene item management"),
						UL([
							LI("Move items by holding Ctrl"),
							LI("Resize using the grab handle bottom right"),
							LI("Double-click any item to get details"),
							LI("Locked items cannot be moved - see the item details below."),
						]),
					]),
				]),
			]),
			DETAILS({class: "hidden"}, [SUMMARY("Scene items (click for item details)"),
				UL({id: "sceneitems"}),
			]),
		],
	},
	section_connect: {
		title: "Connect/login",
		render: layout => [
			TABLE([
				TR([
					TD("Protocol:"),
					TD([
						LABEL([INPUT({type: "checkbox", id: "ssl"}), " SSL"]),
						" ",
						LABEL([INPUT({type: "checkbox", id: "v5"}), " V5 (OBS 28+)"]),
					]),
				]),
				TR([
					TD(LABEL({for: "ip"}, "Server IP or name:")),
					TD([INPUT({id: "ip", size: 20, value: "localhost"}), " eg ", CODE("localhost")]),
				]),
				TR([
					TD(LABEL({for: "port"}, "Port:")),
					TD([INPUT({id: "port", type: "number", min: 1, value: 4455, max: 65535}),
						" default is 4444 on v4, 4455 on v5"]),
				]),
				TR([
					TD(LABEL({for: "password"}, "Password:")),
					TD(INPUT({id: "password", size: 20})),
				]),
				TR([
					TD(LABEL({for: "uri"}, "Connect URI:")),
					TD(INPUT({id: "uri", size: 40, value: "obsws://localhost:4455/"})),
				]),
			]),
			BUTTON({id: "reconnect"}, "Connect to OBS"),
		],
	},
	section_mixer: {
		title: "Volume mixer",
		render: layout => TABLE({id: "volumes"}, TBODY())
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
		title: "Web Page",
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
	if (s && definitions[t]) {
		definitions[key] = Object.assign(Object.create(definitions[t]), definitions[key]);
		definitions[t].active = false; //If there's a subtype definition, don't use the master
	}
	definitions[key].active = true;
});
export function get_basis_object(layout) {return definitions[layout.type + "_" + layout.subtype] || definitions[layout.type] || { };}

export const rendered_layout = [];
console.log(rendered_layout)

export const add_element_dropdown = () => SELECT({class: "addelem editonly"}, [
	OPTION({disabled: true, value: "", selected: true}, "Add element"),
	Object.entries(definitions).map(([type, info]) =>
		info.active && OPTION({value: type}, info.title)),
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
	//NOTE: Carrying the data in a dedicated MIME type (I was using application/prs.obs-rc-element)
	//doesn't work on mobile. So if you drag from here to a textarea, you'll get a JSON layout
	//representation, which is a bit weird, but whatever.
	e.dataTransfer.setData("text/plain", layout);
	e.dataTransfer.effectAllowed = "copyMove";
}
