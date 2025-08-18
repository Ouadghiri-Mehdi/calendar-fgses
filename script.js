document.addEventListener("DOMContentLoaded", function () {
  const calendarEl = document.getElementById("calendar");
  const professorListEl = document.getElementById("professorList");

  const professorColors = {};
  const activeProfessors = new Set();
  let allEvents = [];

  function generateColor(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const h = Math.abs(hash % 360);
    return `hsl(${h}, 70%, 50%)`;
  }

  function cleanText(str) {
    return str.replace(/\u00A0/g, " ").trim();
  }

  function formatDate(dateStr) {
    const [day, month, year] = dateStr.split("/").map(s => s.padStart(2, "0"));
    return `${year}-${month}-${day}`;
  }

  function formatDatePlusOne(dateStr) {
    const [year, month, day] = dateStr.split("-").map(Number);
    const date = new Date(year, month - 1, day + 1);
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  // Charger CSV depuis Google Sheets
  fetch("https://docs.google.com/spreadsheets/d/e/2PACX-1vRt_E5CMLuTjayFcmYZlU9ndKGI57j81C8oSgcvP-rrYCt5EwJmhOhG7h2QsYmzEA/pub?gid=491827363&single=true&output=csv")
    .then(response => response.text())
    .then(csvText => {
      const rows = csvText.split("\n").map(r => r.split(","));
      
      rows.slice(1).forEach(row => {
        const professor = cleanText(row[0]);
        const stays = row.slice(1).filter(Boolean).map(cleanText);

        if (!professorColors[professor]) {
          professorColors[professor] = generateColor(professor);
          activeProfessors.add(professor);
        }

        stays.forEach((stay, idx) => {
          try {
            if (!stay.includes("au")) return;
            const [startStr, endStr] = stay.split("au").map(cleanText);
            const start = formatDate(startStr);
            const end = formatDatePlusOne(formatDate(endStr));

            allEvents.push({
              title: `${professor} (Séjour ${idx + 1})`,
              start: start,
              end: end,
              color: professorColors[professor],
              allDay: true,
              extendedProps: { professor }
            });
          } catch (e) {
            console.warn("Erreur parsing :", stay, e);
          }
        });
      });

      const calendar = new FullCalendar.Calendar(calendarEl, {
        initialView: "dayGridMonth",
        locale: "fr",
        height: "auto",
        expandRows: true,
        headerToolbar: {
          left: "prev,next today",
          center: "title",
          right: "dayGridMonth,timeGridWeek,listWeek"
        },
        events: (info, successCallback) => {
          successCallback(
            allEvents.filter(e => activeProfessors.has(e.extendedProps.professor))
          );
        }
      });

      calendar.render();

      // Panneau filtrage
      Object.entries(professorColors).forEach(([prof, color]) => {
        const item = document.createElement("div");
        item.className = "filter-item";
        item.innerHTML = `
          <input type="checkbox" id="chk-${prof}" checked>
          <span class="filter-color" style="background:${color}"></span>
          <label for="chk-${prof}">${prof}</label>
        `;
        professorListEl.appendChild(item);

        item.querySelector("input").addEventListener("change", e => {
          if (e.target.checked) activeProfessors.add(prof);
          else activeProfessors.delete(prof);
          calendar.refetchEvents();
        });
      });

      // Tout sélectionner / Tout désélectionner
      document.getElementById("selectAll").addEventListener("click", () => {
        Object.keys(professorColors).forEach(prof => {
          activeProfessors.add(prof);
          document.getElementById(`chk-${prof}`).checked = true;
        });
        calendar.refetchEvents();
      });

      document.getElementById("deselectAll").addEventListener("click", () => {
        activeProfessors.clear();
        Object.keys(professorColors).forEach(prof => {
          document.getElementById(`chk-${prof}`).checked = false;
        });
        calendar.refetchEvents();
      });
    });
});
