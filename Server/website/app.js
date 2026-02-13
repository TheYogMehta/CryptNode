const nodes = document.querySelectorAll(".reveal");

const observer = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        entry.target.classList.add("visible");
        observer.unobserve(entry.target);
      }
    }
  },
  { threshold: 0.12 },
);

nodes.forEach((node) => observer.observe(node));

async function loadReleases() {
  try {
    const res = await fetch("/releases.json");
    if (!res.ok) throw new Error("Failed to load releases");
    const releases = await res.json();

    if (releases.length === 0) return;

    renderLatest(releases[0]);
    renderAllVersions(releases);
  } catch (err) {
    console.error(err);
    document.getElementById("latest-download").innerHTML =
      `<p style="color: #ff6b6b">Error loading downloads. Please try again later.</p>`;
  }
}

function renderLatest(release) {
  const container = document.getElementById("latest-download");
  container.innerHTML = "";

  const { version, files } = release;
  const baseUrl = `/releases/${version}/`;

  // Helper to create button
  const createBtn = (label, icon, filename) => {
    if (!filename) return "";
    return `<a class="btn btn-primary" href="${baseUrl}${filename}" download>
      ${icon} Download for ${label}
    </a>`;
  };

  let html = "";
  // We can use simple text emojis or SVG icons if we had them. Using text for now.
  html += createBtn("Windows", "", files.windows);
  html += createBtn("Linux", "", files.linux);
  html += createBtn("Android", "", files.android);

  container.innerHTML =
    html || "<p>No downloads available for the latest version.</p>";
}

function renderAllVersions(releases) {
  const container = document.getElementById("version-list");
  const list = document.getElementById("versions-ul");

  if (releases.length === 0) return;

  container.classList.remove("hidden");

  list.innerHTML = releases
    .map((r) => {
      const baseUrl = `/releases/${r.version}/`;

      const links = Object.entries(r.files)
        .map(([os, filename]) => {
          const label = os.charAt(0).toUpperCase() + os.slice(1);
          return `<a class="v-link" href="${baseUrl}${filename}" download>${label}</a>`;
        })
        .join("");

      return `
      <li>
        <div class="v-header">
          <span class="v-title">${r.version}</span>
          <span class="v-date">${r.date}</span>
        </div>
        <div class="v-files">${links}</div>
        <p style="margin: 0.5rem 0 0; font-size: 0.9rem; color: #b6c2e3;">${r.notes || ""}</p>
      </li>
    `;
    })
    .join("");
}

loadReleases();
