import {choc, DOM, set_content} from "https://rosuav.github.io/choc/factory.js";
const {LI, LINK, P, SECTION, UL} = choc; //autoimport

DOM("#layoutmode").onclick = () => {
	const win = window.open("", "toolbox", "popup=1,width=300,height=650");
	console.log(win)
	set_content(win.document.body, [
		LINK({rel: "stylesheet", href: new URL("layout.css", location).href}),
		P("Hello, world!"),
		SECTION({id: "demo"}, [
			P("Drag this thing!"),
			UL("Test list with a number of elements".split(" ").map(w => LI(w))),
		]),
	]).id = "toolbox";
};
