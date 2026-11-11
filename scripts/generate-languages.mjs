
const username = "tineetot";
const outputPath = "profile/languages.svg";
const maxLanguages = 8;

const palette = [
  "#D96C86", // Dusty rose
  "#F4ACB7", // Soft pink
  "#B5839A", // Muted mauve
  "#A65370", // Rosewood
  "#E8B9C5", // Pale blush
  "#C77D98", // Muted rose
  "#8E647D", // Muted plum
  "#E5A0B0"  // Soft rose
];

const token = process.env.GITHUB_TOKEN;

if (!token) {
  throw new Error("GITHUB_TOKEN is missing.");
}

const headers = {
  Accept: "application/vnd.github+json",
  Authorization: `Bearer ${token}`,
  "X-GitHub-Api-Version": "2022-11-28"
};

async function githubApi(path) {
  const response = await fetch(`https://api.github.com${path}`, {
    headers
  });

  if (!response.ok) {
    throw new Error(
      `GitHub API error ${response.status}: ${await response.text()}`
    );
  }

  return response.json();
}

// Get all repositories owned by the user.
async function getRepositories() {
  const repositories = [];
  let page = 1;

  while (true) {
    const batch = await githubApi(
      `/users/${username}/repos?type=owner&per_page=100&page=${page}`
    );

    repositories.push(...batch);

    if (batch.length < 100) break;
    page++;
  }

  // Exclude forks so other people's code is not counted.
  return repositories.filter(repo => !repo.fork);
}

// Collect and combine language bytes across repositories.
async function getLanguageStats() {
  const repositories = await getRepositories();
  const totals = {};

  const results = await Promise.all(
    repositories.map(repo => githubApi(
      `/repos/${username}/${repo.name}/languages`
    ))
  );

  for (const languages of results) {
    for (const [language, bytes] of Object.entries(languages)) {
      totals[language] = (totals[language] || 0) + bytes;
    }
  }

  const sorted = Object.entries(totals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxLanguages);

  const selectedTotal = sorted.reduce(
    (sum, [, bytes]) => sum + bytes,
    0
  );

  if (!selectedTotal) {
    throw new Error("No language statistics were returned.");
  }

  return sorted.map(([name, bytes], index) => ({
    name,
    percentage: (bytes / selectedTotal) * 100,
    color: palette[index % palette.length]
  }));
}

function escapeXml(value) {
  return String(value).replace(/[<>&"']/g, character => ({
    "<": "&lt;",
    ">": "&gt;",
    "&": "&amp;",
    '"': "&quot;",
    "'": "&apos;"
  })[character]);
}

function createSvg(languages) {
  const width = 600;
  const barWidth = 540;
  const barHeight = 10;
  const barY = 48;
  const legendStartY = 88;
  const rowHeight = 30;
  const rows = Math.ceil(languages.length / 2);
  const height = legendStartY + rows * rowHeight + 12;

  let currentX = 0;

  const segments = languages.map((language, index) => {
    const segmentWidth =
      index === languages.length - 1
        ? barWidth - currentX
        : barWidth * language.percentage / 100;

    const segment = `
      <rect
        x="${currentX}"
        y="${barY}"
        width="${segmentWidth}"
        height="${barHeight}"
        fill="${language.color}"
      />
    `;

    currentX += segmentWidth;
    return segment;
  }).join("");

  const legend = languages.map((language, index) => {
    const column = index % 2;
    const row = Math.floor(index / 2);
    const x = column === 0 ? 0 : 300;
    const y = legendStartY + row * rowHeight;

    return `
      <circle
        cx="${x + 6}"
        cy="${y + 5}"
        r="6"
        fill="${language.color}"
      />
      <text
        x="${x + 20}"
        y="${y + 9}"
        class="legend"
      >${escapeXml(language.name)} ${language.percentage.toFixed(2)}%</text>
    `;
  }).join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg
  xmlns="http://www.w3.org/2000/svg"
  width="${width}"
  height="${height}"
  viewBox="0 0 ${width} ${height}"
  role="img"
  aria-labelledby="title"
>
  <title id="title">Most Used Languages</title>

  <style>
    .heading {
      font-family: Arial, Helvetica, sans-serif;
      font-size: 22px;
      font-weight: 700;
      fill: #F4ACB7;
    }

    .legend {
      font-family: Arial, Helvetica, sans-serif;
      font-size: 13px;
      fill: #C9D1D9;
    }
  </style>

  <text x="0" y="25" class="heading">Most Used Languages</text>

  <defs>
    <clipPath id="barClip">
      <rect x="0" y="${barY}" width="${barWidth}" height="${barHeight}" rx="5"/>
    </clipPath>
  </defs>

  <rect
    x="0"
    y="${barY}"
    width="${barWidth}"
    height="${barHeight}"
    rx="5"
    fill="#30363D"
  />

  <g clip-path="url(#barClip)">
    ${segments}
  </g>

  ${legend}
</svg>`;
}

async function main() {
  const languages = await getLanguageStats();
  const svg = createSvg(languages);

  const { writeFile, mkdir } = await import("node:fs/promises");

  await mkdir("profile", { recursive: true });
  await writeFile(outputPath, svg, "utf8");

  console.log("Language stats generated successfully:");
  for (const language of languages) {
    console.log(
      `${language.name}: ${language.percentage.toFixed(2)}%`
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
