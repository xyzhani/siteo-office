// FICTIONAL sample businesses for demo mode. None of these exist. Their "old websites" are served by this app
// at /demo-sites/<slug>/ so Tom can really fetch and audit them. Domains use the reserved .example TLD.
export const DEMO_TOWN = "Sampleton";

const D = (o) => ({ fictional: true, town: DEMO_TOWN, country: "Fictionland", ...o });

export const DEMO = {
  dental: [
    D({ slug: "pearlgate-dental", name: "Pearlgate Dental", owner: "Dr. Mira Calloway", phone: "+00 555 0101", email: "hello@pearlgate-dental.example", address: "12 Quay Street, Sampleton",
      hours: ["Mon–Thu 9:00–17:30", "Fri 9:00–14:00"], services: ["Check-ups and cleaning", "Fillings", "Teeth whitening", "Emergency appointments"],
      since: "2004", extra: "Wheelchair access at the side entrance.", style: "old" }),
    D({ slug: "brightwater-family-dentistry", name: "Brightwater Family Dentistry", owner: "Dr. Tomas Reyna", phone: "+00 555 0102", email: "frontdesk@brightwater-dentistry.example", address: "4 Mill Lane, Sampleton",
      hours: ["Mon–Fri 8:30–18:00", "Sat 9:00–13:00"], services: ["Family dentistry", "Children's check-ups", "Crowns and bridges", "Invisible aligners"],
      since: "2011", extra: "Free parking behind the practice.", style: "dated" }),
    D({ slug: "lindenrow-dental-care", name: "Lindenrow Dental Care", owner: "Dr. Hana Okafor", phone: "+00 555 0103", email: "care@lindenrow-dental.example", address: "88 Linden Row, Sampleton",
      hours: ["Tue–Sat 9:00–17:00"], services: ["Gentle care for nervous patients", "Hygienist visits", "Root canal treatment", "Dentures"],
      since: "1998", extra: "", style: "old" }),
    D({ slug: "harbour-smile-studio", name: "Harbour Smile Studio", owner: "Dr. Eli Marsh", phone: "+00 555 0104", email: "team@harbour-smile.example", address: "1 Harbour Walk, Sampleton",
      hours: ["Mon–Fri 8:00–19:00"], services: ["Implants", "Whitening", "Check-ups"], since: "2019", extra: "", style: "modern" }),
    D({ slug: "oakmere-dental-practice", name: "Oakmere Dental Practice", owner: "Dr. Sana Pike", phone: "+00 555 0105", email: "info@oakmere-dental.example", address: "21 Oakmere Road, Sampleton",
      hours: ["Mon–Fri 9:00–17:00"], services: ["General dentistry", "Hygienist", "Mouthguards"], since: "2008", extra: "", style: "dated" }),
  ],
  restaurants: [
    D({ slug: "copper-kettle-bistro", name: "The Copper Kettle Bistro", owner: "Ines Varga", phone: "+00 555 0201", email: "book@copper-kettle.example", address: "7 Market Square, Sampleton",
      hours: ["Wed–Sun 12:00–22:00"], services: ["Seasonal lunch menu", "Sunday roast", "Private dining room for 20"], since: "2009", extra: "Dog-friendly terrace.", style: "old" }),
    D({ slug: "saltmarsh-fish-kitchen", name: "Saltmarsh Fish Kitchen", owner: "Callum Reid", phone: "+00 555 0202", email: "hello@saltmarsh-kitchen.example", address: "3 Pier Road, Sampleton",
      hours: ["Tue–Sat 17:00–22:30"], services: ["Fish of the day", "Takeaway fish and chips", "Kids' menu"], since: "2015", extra: "", style: "dated" }),
    D({ slug: "nonna-rosetta-trattoria", name: "Nonna Rosetta Trattoria", owner: "Rosa Bellini", phone: "+00 555 0203", email: "ciao@nonna-rosetta.example", address: "45 High Street, Sampleton",
      hours: ["Mon–Sun 12:00–23:00"], services: ["Fresh pasta made daily", "Wood-fired pizza", "Gluten-free options"], since: "1996", extra: "Family run.", style: "old" }),
    D({ slug: "greenleaf-cafe", name: "Greenleaf Café", owner: "Priya Shah", phone: "+00 555 0204", email: "hi@greenleaf-cafe.example", address: "9 Park Lane, Sampleton",
      hours: ["Mon–Sat 8:00–16:00"], services: ["Breakfast", "Vegan bowls", "Coffee"], since: "2020", extra: "", style: "modern" }),
    D({ slug: "ember-oak-grill", name: "Ember & Oak Grill", owner: "Marco Duval", phone: "+00 555 0205", email: "reservations@ember-oak.example", address: "60 Bridge Street, Sampleton",
      hours: ["Thu–Sun 17:00–23:00"], services: ["Steaks from the grill", "Vegetarian grill plates", "Weekend brunch"], since: "2012", extra: "", style: "dated" }),
  ],
};

export function demoBusinesses(niche) { return DEMO[niche] || DEMO.dental; }
export function demoBySlug(slug) { for (const list of Object.values(DEMO)) { const b = list.find((x) => x.slug === slug); if (b) return b; } return null; }

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// A deliberately weak "old website" (old = tables, no viewport, no meta description; dated = some issues; modern = fine)
export function demoSiteHtml(b) {
  const banner = `<div style="background:#ffe9a8;color:#5a4300;padding:6px;font:13px sans-serif;text-align:center">FICTIONAL demo business for Siteo Office. Not a real company.</div>`;
  const list = (a) => a.map((x) => `<li>${esc(x)}</li>`).join("");
  if (b.style === "modern") {
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(b.name)}</title><meta name="description" content="${esc(b.name)} in ${esc(b.town)}."></head>
<body style="font-family:system-ui;margin:0">${banner}<header style="padding:40px"><h1>${esc(b.name)}</h1><p>Book online in 60 seconds.</p><a href="tel:${esc(b.phone)}">${esc(b.phone)}</a> · <a href="/book">Book online</a></header>
<section style="padding:0 40px"><h2>Services</h2><ul>${list(b.services)}</ul><h2>Opening hours</h2><ul>${list(b.hours)}</ul><p>${esc(b.address)} · <a href="mailto:${esc(b.email)}">${esc(b.email)}</a></p></section>
<footer style="padding:40px">© ${new Date().getFullYear()} ${esc(b.name)}</footer></body></html>`;
  }
  const old = b.style === "old";
  return `<html><head><title>${old ? "Welcome" : esc(b.name)}</title>${old ? "" : `<meta name="description" content="${esc(b.name)}">`}</head>
<body bgcolor="#dfe7ef">${banner}<table width="960" align="center" cellpadding="8" border="0"><tr><td colspan="2" bgcolor="#336699"><font color="white" size="6">${esc(b.name)}</font><br><font color="#cfe">Est. ${esc(b.since)}</font></td></tr>
<tr><td width="200" valign="top" bgcolor="#eef"><b>Menu</b><br>Home<br>About us<br>Services<br>Contact</td><td valign="top">
<p>Welcome to ${esc(b.name)}, ${esc(b.address)}. ${esc(b.owner)} and the team look forward to seeing you.</p>
<h3>Our services</h3><ul>${list(b.services)}</ul>
<h3>Opening hours</h3><ul>${list(b.hours)}</ul>
${b.extra ? `<p>${esc(b.extra)}</p>` : ""}
<p>Call us: ${esc(b.phone)}<br>Email: <a href="mailto:${esc(b.email)}">${esc(b.email)}</a></p>
<p><img src="/demo-sites/photo.svg" width="900" height="600"> <img src="/demo-sites/photo.svg" width="900" height="600"></p>
</td></tr><tr><td colspan="2"><font size="1">Copyright ${old ? 2013 : 2017} ${esc(b.name)}. Best viewed in 1024x768.</font></td></tr></table></body></html>`;
}
