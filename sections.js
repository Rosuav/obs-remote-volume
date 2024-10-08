import {choc, DOM, set_content} from "https://rosuav.github.io/choc/factory.js";
const {BUTTON, CANVAS, CODE, DIV, FORM, IFRAME, INPUT, LABEL, LI, OPTION, P, PRE, SECTION, SELECT, SPAN, TABLE, TBODY, TD, TH, TR, UL} = choc; //autoimport

//NOTE: Avoid using any CSS IDs anywhere in these definitions.
//It should be perfectly reasonable to have the same section in two places
//(which could happen with layout switching); look up based on the element.
const definitions = {
	section: {
		title: "Unknown section",
		render: layout => [
			P("Oops - it seems something has been renamed or removed."),
			PRE(JSON.stringify(layout, null, 4)),
		],
		safe_parse: elem => ({type: "section", subtype: elem.subtype}),
	},
	section_wireframe: {
		title: "Scene wireframe",
		render: layout => CANVAS({class: "wireframe"}),
		update: (elem, state) => {
			//Should the canvas get a resize observer so it always operates at intrinsic size??
			//Alternatively - what if we have an off-screen canvas for the main drawing, which
			//would have an intrinsic size exactly equal to the canvas size, and then blit to
			//the main canvas at its own size? The hard part would be mapping mouse events back
			//to the original coordinate system, but that mightn't be too hard if it's a simple
			//scaling ratio (probably the same in each dimension) and maybe a translation.
			console.log("Wireframe!", state.video);
			const canvas = elem.querySelector("canvas");
			console.log(canvas.width, canvas.height);
			const r = canvas.getBoundingClientRect(); console.log(r);
			const ctx = canvas.getContext("2d");
			console.log(ctx);
			return;
			//scenepreview.style.width = (canvasx * display_scale) + "px";
			//scenepreview.style.height = (canvasy * display_scale) + "px";
			//while (layout.lastChild) resizeObserver.unobserve(layout.removeChild(layout.lastChild));
			set_content(elem.querySelector(".scenepreview"), state.sources.map(source => {
				const typeinfo = state.sourcetypes[source.type || source.inputKind];
				if (!typeinfo || !typeinfo.caps.hasVideo) return;
				//TODO: If the scene item is locked, don't make it resizable (but allow lock to be toggled)
				//TODO: Correctly handle item gravity (alignment)
				const el = DIV({class: "sceneelement", "data-origin": source.origin},
					source.sourceName);
				/*update_element(el, { //FIXME: Bring this into here??
					width: source.cx, height: source.cy,
					locked: source.locked,
					//TODO: Alignment (gravity) is not provided by the SwitchScenes
					//event, nor the GetCurrentScene query. Enhance them upstream,
					//or query gravity some other way. For now, assume top-left.
					position: {alignment: source.alignment, x: source.x, y: source.y},
					sourceWidth: source.source_cx, sourceHeight: source.source_cy,
				});*/
				//el.onpointerdown = startdragging; //TODO: Do these with on() instead
				//el.onpointerup = stopdragging;
				//resizeObserver.observe(el); //Hacked out for now
				return el;
			}));
		},
	},
	section_sceneitems: {
		title: "Scene items",
		render: layout => [UL({class: "sceneitems"}, [
			LI(BUTTON("Scene")),
			LI(BUTTON("elements")),
			LI(BUTTON("go")),
			LI(BUTTON("here")),
		])],
		update: (elem, state) => {
			set_content(elem.querySelector(".sceneitems"), state.sources.map(source => {
				return LI([
					BUTTON({class: "sceneelembtn", "data-origin": source.origin}, source.sourceName),
					" ",
					BUTTON({class: "sceneelemvisibility", "data-origin": source.origin, title: "Hide/show"},
						source.sceneItemEnabled ? "👁️" : "🚫"),
				]);
			}));
		},
		adjust: (source, el) => {
			if (el.classList.contains("sceneelemvisibility")) set_content(el, source.sceneItemEnabled ? "👁️" : "🚫");
		},
	},
	section_streamstatus: {
		title: "Stream status",
		render: layout => [
			BUTTON({class: "status_streaming"}, "Streaming"),
			BUTTON({class: "status_recording"}, "Recording"),
		],
		update: (elem, state) => {
			const xlat = {
				"OBS_WEBSOCKET_OUTPUT_STOPPED": "Start", "OBS_WEBSOCKET_OUTPUT_STARTING": "Starting",
				"OBS_WEBSOCKET_OUTPUT_STARTED": "CURRENTLY", "OBS_WEBSOCKET_OUTPUT_STOPPING": "Stopping",
			};
			for (let srl of ["stream", "record"]) {
				const st = xlat[state.status[srl]];
				set_content(elem.querySelector(`.status_${srl}ing`), `${st} ${srl}ing`).dataset.status = st;
			}
		},
	},
	section_connect: {
		//Special case: IDs are permitted here, as you can't put this section into a layout.
		//It is still necessary to reference elements from the given top-level elem, though,
		//as it's possible that this won't be in the document when an update comes through.
		active: false,
		title: "Connect/login",
		render: layout => FORM({id: "connectform"}, [
			TABLE([
				TR([
					TD("Protocol:"),
					TD([
						LABEL([INPUT({type: "checkbox", id: "ssl"}), " SSL"]),
						" ",
						LABEL([INPUT({type: "checkbox", id: "v5", checked: true}), " V5 (OBS 28+)"]),
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
					TD([
						INPUT({id: "password", size: 20}),
						" ",
						LABEL([INPUT({type: "checkbox", id: "revealpwd"}), " Reveal password"]),
					]),
				]),
				TR([
					TD(LABEL({for: "uri"}, "Connect URI:")),
					TD(INPUT({id: "uri", size: 40, value: "obsws://localhost:4455/"})),
				]),
				TR([
					TD(),
					TD([
						BUTTON({class: "clipbtn", type: "button"}, "Copy bookmarkable link"),
						" Note: The copied link will include your password!",
					]),
				]),
			]),
			DIV({id: "connect_error", class: "hidden"}),
			UL({class: "buttonbox"}, [
				LI(BUTTON({id: "reconnect"}, "Connect to OBS")),
				LI(BUTTON({id: "autoconnect", type: "button"}, "Remember this server")),
			]),
			P(
				"To use this tool, go to OBS, and configure WebSocket Settings in the Tools menu." +
				" Enter the connection info above (notably, the password), and then click Connect." +
				" This tool is capable of scene selection, audio mixer adjustment, starting/stopping" +
				" the stream or recording, and more."
			),
		]),
		update: (elem, state) => {
			Object.entries(state.connect_info).forEach(([id, val]) => {
				const el = elem.querySelector("#" + id);
				if (el) el[el.type === "checkbox" ? "checked" : "value"] = val;
			});
			elem.querySelector("#password").type = state.connect_info.revealpwd ? "text" : "password";
			const url = new URL(location);
			url.hash = state.connect_info.uri +
				(state.connect_info.revealpwd ? "" : state.connect_info.password);
			elem.querySelector(".clipbtn").dataset.copyme = url.href;
			set_content(elem.querySelector("#connect_error"), state.last_connect_error)
				.classList.toggle("hidden", !state.last_connect_error);
		},
	},
	section_mixer: {
		title: "Volume mixer",
		render: layout => TABLE(TBODY(TR([
			TH("Volume mixer"),
			TD(INPUT({class: "volslider", disabled: "true", type: "range", min: 0, max: 1, step: "any", value: 1})),
			TD([
				SPAN({class: "percent"}, "100.00"),
				BUTTON({type: "button"}, "Mute"),
			]),
		]))),
		update: (elem, state) => set_content(elem.querySelector("tbody"), state.sources.map(source => {
			const typeinfo = state.sourcetypes[source.type || source.inputKind];
			if (typeinfo && !typeinfo.caps.hasAudio) return null; //It's a non-audio source. (Note that browser sources count as non-audio, despite being able to make noises.)
			//Note that if !typeinfo, we assume no video, but DO put it on the mixer.
			return TR({"data-origin": source.origin}, [
				TH(source.sourceName),
				TD(INPUT({
					class: "volslider", type: "range",
					min: 0, max: 1, step: "any", "value": Math.sqrt(source.volume),
				})),
				TD([
					SPAN({class: "percent"}, (Math.sqrt(source.volume)*100).toFixed(2)),
					BUTTON(
						{type: "button", class: "mutebtn"},
						source.muted ? "Unmute" : "Mute",
					)
				]),
			]);
		})),
		adjust: (source, el) => {
			el.querySelector(".volslider").value = source.volume ** 0.5;
			set_content(el.querySelector(".percent"), ""+(Math.sqrt(source.volume)*100).toFixed(2));
			set_content(el.querySelector(".mutebtn"), source.muted ? "Unmute" : "Mute");
		},
	},
	section_sceneswitch: {
		title: "Scene switcher",
		config: {
			columns: ["Columns", 4],
		},
		render: layout => DIV({style: "grid-template-columns: repeat(" + (layout.columns || 4) + ", 1fr)"}),
		update: (elem, state) => set_content(elem.firstElementChild, state.scenes.scenes.map(scene => BUTTON(
			{class: scene.sceneName === state.scenes.currentProgramSceneName ? "current" : "",
				"data-sceneselect": scene.sceneName},
			P(scene.sceneName),
		))),
	},
	split: {
		title: "Split bar",
		config: {
			active: ["Always active", false],
		},
		safe_parse: elem => ({
			type: "split",
			subtype: elem.subtype === "vertical" ? "vertical" : "horizontal",
			splitpos: typeof elem.splitpos === "number" ? elem.splitpos : null,
			active: !!elem.active,
			children: Array.isArray(elem.children) ? [
				safe_parse_element(elem.children[0]),
				safe_parse_element(elem.children[1]),
			] : [{}, {}],
		}),
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
			titlebar: ["Show title bar", false],
		},
		//If more flexibility is needed, this function can return whatever it
		//needs to - the second arg is elements generated from the config.
		//settingsdlg: (layout, table) => table,
		//Similarly, extra flexibility on saving of settings can be done with
		//this function, called after the other settings are applied:
		//savesettings: layout => { },
		safe_parse: elem => ({
			type: "iframe",
			titlebar: !!elem.titlebar,
			title: typeof elem.title === "string" ? elem.title : null,
			src: typeof elem.src === "string" ? elem.src : null,
			id: elem.id || (""+Math.random()).replace("0.", ""), //Generate an ID which the user may subsequently edit if desired
		}),
	},
	box: {
		active: false,
		title: "Box (invisible)",
		safe_parse: elem => {
			if (!Array.isArray(elem.children) || elem.children.length < 2) return { };
			return {
				type: "box",
				subtype: elem.subtype === "vertical" ? "vertical" : "horizontal",
				children: elem.children.map(safe_parse_element),
			};
		},
	},
	layout: { //Hack - simplify settings dialog for the layout itself
		active: false, title: "Layout",
		config: {
			label: ["Label", ""],
			is_default: ["Make default", false],
		},
	},
};
//Is this a good use for prototype inheritance? Effectively, split_horizontal inherits from split implicitly.
Object.keys(definitions).forEach(key => {
	const [t, s] = key.split("_");
	if (s && definitions[t]) {
		definitions[key] = Object.assign(Object.create(definitions[t]), definitions[key]);
		definitions[t].active = false; //If there's a subtype definition, don't use the master
	}
	//For some bizarre reason, hasOwnProperty - which has better browser support - always
	//returns false for these, even if they've just been assigned to. I don't get it.
	if (!definitions[key].hasOwnProperty("active")) definitions[key].active = true;
});
export function get_basis_object(layout) {return definitions[layout.type + "_" + layout.subtype] || definitions[layout.type] || { };}

export const rendered_layout = [];
console.log(rendered_layout)
const updateme = []; let laststate = null;
export function send_updates(state) {
	laststate = state;
	updateme.forEach(([basis, elem]) => basis.update(elem, state));
}
export function adjust_state(source) {
	//Abbreviated update of a single source. I *really* hope that JSONifying
	//is equivalent to CSS's quoting rules, because I honestly don't know
	//exactly what CSS's rules are. But for the most part, this will be fine
	//(since the most important thing to take care of is spaces in names).
	const sel = "[data-origin=" + JSON.stringify(source.origin) + "]";
	updateme.forEach(([basis, elem]) => basis.adjust &&
		elem.querySelectorAll(sel).forEach(el => basis.adjust(source, el)));
}

export const add_element_dropdown = () => SELECT({class: "addelem editonly"}, [
	OPTION({disabled: true, value: "", selected: true}, "Add element"),
	Object.entries(definitions).map(([type, info]) =>
		info.active && OPTION({value: type}, info.title)),
	OPTION({value: ""}, "(cancel)"),
]);

export function safe_parse_element(elem) {
	//Parse an untrusted element object and return something which,
	//if possible, represents the original intention
	if (typeof elem !== "object") return { };
	const basis = get_basis_object(elem);
	if (basis && basis.safe_parse) return basis.safe_parse(elem);
	return { };
}

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
		//If any of the box's children is set to shrink, also shrink the box.
		//This is a bit odd, but it effectively lets the child's shrink work
		//in both dimensions. TODO: Make this work recursively, so a box that
		//contains a box that contains a shrunk child will shrink.
		if (layout.children.find(c => c.flexsize === "fitcontent"))
			ret.style.flex = "1 0 fit-content";
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
			if (layout.flexsize === "fitcontent") ret.style.flex = "1 0 fit-content";
			break;
		}
		case "section":
			ret = SECTION({"data-subtype": layout.subtype, class: "droptarget"}, basis.render(layout));
			if (layout.flexsize === "fitcontent") ret.style.flex = "1 0 fit-content";
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
			if (layout.titlebar) {tb = true; if (ret.contentDocument) deftitle = ret.contentDocument.title || deftitle;}
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
	if (!editmode && basis.update) {updateme.push([basis, ret]); if (laststate) basis.update(ret, laststate);}
	return ret;
}
export function render(layout, editing) {
	if (editing === "toolbox") {
		//Hack: Autopopulate the toolbox layout based on the definitions list
		layout.children = Object.entries(definitions).map(([ts, basis]) => {
			if (!basis.active || !basis.safe_parse) return null;
			const [type, subtype] = ts.split("_");
			return basis.safe_parse({type, subtype});
		}).filter(e => e);
	}
	editmode = editing;
	rendered_layout[0] = {type: "master", children: [layout]};
	rendered_layout.length = 1; //Truncate the array
	updateme.length = 0;
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
