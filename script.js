document.addEventListener("DOMContentLoaded", function () {
  // Toggle du thème sombre
  const themeToggle = document.getElementById('themeToggle');
  const themeIcon = themeToggle.querySelector('i');
  
  // Vérifier la préférence utilisateur
  if (localStorage.getItem('darkMode') === 'enabled') {
    document.body.classList.add('dark-mode');
    themeIcon.classList.remove('fa-moon');
    themeIcon.classList.add('fa-sun');
  }
  
  themeToggle.addEventListener('click', () => {
    document.body.classList.toggle('dark-mode');
    
    if (document.body.classList.contains('dark-mode')) {
      localStorage.setItem('darkMode', 'enabled');
      themeIcon.classList.remove('fa-moon');
      themeIcon.classList.add('fa-sun');
    } else {
      localStorage.setItem('darkMode', null);
      themeIcon.classList.remove('fa-sun');
      themeIcon.classList.add('fa-moon');
    }
  });

  const calendarEl = document.getElementById("calendar");
  const professorListEl = document.getElementById("professorList");
  const customListViewEl = document.getElementById("customListView");
  const monthFilter = document.getElementById("monthFilter");
  const professorSearch = document.getElementById("professorSearch");

  // Définir la vue initiale sur "Liste" qui est la vue par défaut
  calendarEl.style.display = "none";
  customListViewEl.style.display = "block";

  const courseModal = document.getElementById("courseModal");
  const modalTitle = document.getElementById("modal-title");
  const modalBody = document.getElementById("modal-body");
  const closeButton = document.querySelector(".close-button");

  const professorColors = {};
  const activeProfessors = new Set();
  let allEvents = [];
  let professorStays = {};
  let professorCourses = {};
  let allMonthKeys = [];
  
  const COURSE_DATA_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRiKbTdBv2sfKE8SGN0IShxe9DVTVutNK62SBf_edzOnO9aM3XhhAkxBvMW6taxn3KjZ0TweVJI76Cs/pub?gid=456749303&single=true&output=csv';
  const STAY_DATA_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRt_E5CMLuTjayFcmYZlU9ndKGI57j81C8oSgcvP-rrYCt5EwJmhOhG7h2QsYmzEA/pub?gid=491827363&single=true&output=csv';

  // Gère les valeurs non-string pour éviter les erreurs.
  function cleanText(str) {
    return (str || "").toString()
      .replace(/\u00A0/g, " ") // Remplace les espaces insécables
      .replace(/\s+/g, ' ') // Réduit les espaces multiples à un seul
      .trim(); // Supprime les espaces au début et à la fin
  }

  const DISTINCT_COLORS = [
    "#e6194B", "#3cb44b", "#ffe119", "#4363d8", "#f58231", "#911eb4",
    "#42d4f4", "#f032e6", "#bfef45", "#fabed4", "#469990", "#dcbeff",
    "#9A6324", "#fffac8", "#800000", "#aaffc3", "#808000", "#ffd8b1",
    "#000075", "#a9a9a9", "#fabebe", "#008080", "#e6beff", "#aa6e28"
  ];

  function generateColor(str) {
    let hash = 0;
    if (str.length === 0) return DISTINCT_COLORS[0];
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
      hash = hash & hash; // Forcer la conversion en entier 32 bits
    }
    const index = Math.abs(hash % DISTINCT_COLORS.length);
    return DISTINCT_COLORS[index];
  }

  // Convertit les heures au format 12h (ex: 6:00p) en format 24h (ex: 18:00)
  function convertTimeTo24Hour(timeStr) {
    if (!timeStr || typeof timeStr !== 'string') return '00:00';

    const time = timeStr.toLowerCase().trim();
    const isPM = time.includes('p');

    let [hours, minutes] = time.replace(/[apm\s]/g, '').split(':');

    hours = parseInt(hours, 10);
    minutes = minutes ? parseInt(minutes, 10) : 0;

    if (isNaN(hours) || isNaN(minutes)) {
      return '00:00';
    }

    if (isPM && hours < 12) {
      hours += 12;
    } else if (!isPM && hours === 12) { // Gère 12:xx AM (minuit)
      hours = 0;
    }
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
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

  // Fonction de recherche
  function filterProfessors() {
    const searchTerm = professorSearch.value.toLowerCase();
    const filterItems = document.querySelectorAll('.filter-item');

    filterItems.forEach(item => {
      const professorName = item.querySelector('label').textContent.toLowerCase();
      if (professorName.includes(searchTerm)) {
        item.style.display = 'flex';
      } else {
        item.style.display = 'none';
      }
    });
  }

  // Fonction pour charger les données des cours à partir d'un fichier local
  function processCourseData(csvText) {
    const rows = csvText.split("\n").map(r => r.split(","));

    console.log("--- Début du traitement du fichier de cours ---");
    professorCourses = {}; // Réinitialiser les données

    rows.slice(1).forEach(row => {
      if (!row || row.length < 5) return;
      const professor = cleanText(row[4]);
      if (!professor) return;
      console.log(`[Fichier Cours] Professeur trouvé : "${professor}"`);
      const courseCode = cleanText(row[0]);
      const courseTitle = cleanText(row[1]);

      // Gérer la date (colonne C, index 2)
      const dateValue = cleanText(row[2]);
      let formattedDate = dateValue;
      
      // Gérer la plage horaire (colonne D, index 3)
      const timeValue = cleanText(row[3]);
      let startTime = '00:00';
      let endTime = '00:00';

      if (timeValue.includes('-')) {
        const [startStr, endStr] = timeValue.split('-').map(t => t.trim());
        startTime = convertTimeTo24Hour(startStr);
        endTime = convertTimeTo24Hour(endStr);
      } else {
        // Si c'est une seule heure, par exemple '10:00a', on l'utilise pour début et fin
        startTime = convertTimeTo24Hour(timeValue);
        endTime = startTime;
      }

      if (!professorCourses[professor]) {
        professorCourses[professor] = [];
      }
      professorCourses[professor].push({
        course: courseCode,
        title: courseTitle,
        start: formattedDate,
        end: formattedDate, // Le cours est sur un seul jour
        startTime: startTime,
        endTime: endTime
      });
    });
    console.log("--- Fin du traitement. Objet professorCourses :", professorCourses);
    if (customListViewEl.style.display === "block") {
      generateMonthlyListView();
    }
  }

  // Fonction pour charger les données des cours depuis Google Sheets
  function fetchCourseData() {
    fetch(COURSE_DATA_URL)
      .then(response => {
        if (!response.ok) {
          throw new Error(`Erreur HTTP: ${response.status}`);
        }
        return response.text();
      })
      .then(csvText => {
        processCourseData(csvText);
      })
      .catch(error => {
        console.error("Erreur lors du chargement des données des cours:", error);
        // Afficher un message d'erreur à l'utilisateur si nécessaire
      });
  }

  // Fonction pour remplir le menu déroulant avec les mois
  function populateMonthFilter() {
    const monthsSet = new Set();
    allEvents.forEach(event => {
      const startDate = new Date(event.start);
      const monthKey = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}`;
      monthsSet.add(monthKey);
    });
    allMonthKeys = Array.from(monthsSet).sort();
    monthFilter.innerHTML = '<option value="all">Tous les mois</option>';
    allMonthKeys.forEach(monthKey => {
      const [year, month] = monthKey.split('-');
      const monthName = new Date(year, month - 1, 1).toLocaleString('fr-FR', {
        month: 'long',
        year: 'numeric'
      });
      const option = document.createElement('option');
      option.value = monthKey;
      option.textContent = monthName.charAt(0).toUpperCase() + monthName.slice(1);
      monthFilter.appendChild(option);
    });
  }

  // Fonction pour générer la vue en liste des professeurs par mois
  function generateMonthlyListView() {
    customListViewEl.innerHTML = '';
    const selectedMonth = monthFilter.value;
    const months = {};

    Object.keys(professorStays).forEach(prof => {
      if (activeProfessors.has(prof)) {
        const hasCourses = professorCourses[prof] && professorCourses[prof].length > 0;
        console.log(`[Vue Liste] Vérification pour "${prof}". Des cours ont-ils été trouvés ? -> ${hasCourses}`);
        const stays = professorStays[prof];
        stays.forEach(stay => {
          const startDate = new Date(stay.startDate || formatDate(stay.start));
          const monthKey = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}`;

          if (selectedMonth === "all" || monthKey === selectedMonth) {
            if (!months[monthKey]) {
              months[monthKey] = {};
            }
            if (!months[monthKey][prof]) {
              months[monthKey][prof] = [];
            }
            months[monthKey][prof].push(stay);
          }
        });
      }
    });

    const sortedMonthKeys = Object.keys(months).sort();

    if (sortedMonthKeys.length === 0) {
      customListViewEl.innerHTML = `
            <div class="no-data">
              <i class="fas fa-inbox"></i>
              <p>Aucun séjour à afficher pour les critères sélectionnés</p>
            </div>
          `;
      return;
    }

    sortedMonthKeys.forEach(monthKey => {
      const [year, month] = monthKey.split('-');
      const monthName = new Date(year, month - 1, 1).toLocaleString('fr-FR', {
        month: 'long',
        year: 'numeric'
      });

      const monthHeader = document.createElement('h3');
      monthHeader.className = 'month-header';
      monthHeader.textContent = monthName.charAt(0).toUpperCase() + monthName.slice(1);
      customListViewEl.appendChild(monthHeader);

      Object.keys(months[monthKey]).forEach(prof => {
        const stays = months[monthKey][prof];
        const profColor = professorColors[prof];

        const card = document.createElement("div");
        card.className = "professor-card";
        card.style.borderLeftColor = profColor;

        let staysHtml = '<ul class="stay-list">';
        stays.forEach(stay => {
          staysHtml += `
                <li class="stay-item">
                  <i class="fas fa-calendar-day"></i>
                  Du ${stay.start} au ${stay.end}
                </li>
              `;
        });
        staysHtml += '</ul>';

        let courseButtonsHtml = '';
        if (professorCourses[prof] && professorCourses[prof].length > 0) {
          courseButtonsHtml = `
                  <button class="view-courses-list-btn" data-prof="${prof.replace(/"/g, '&quot;')}">
                      <i class="fas fa-list-ul"></i> Liste Cours
                  </button>
                  <button class="view-courses-calendar-btn" data-prof="${prof.replace(/"/g, '&quot;')}">
                      <i class="fas fa-calendar-alt"></i> Calendrier Cours
                  </button>`;
        }

        const buttonHtml = `<div class="card-actions">
                  <button class="view-stays-calendar-btn" data-prof="${prof.replace(/"/g, '&quot;')}">
                      <i class="fas fa-plane-departure"></i> Calendrier Séjours
                  </button>
                  ${courseButtonsHtml}
              </div>`;

        card.innerHTML = `
              <div class="professor-card-header">
                <h4>
                  <span class="color-badge" style="background:${profColor}"></span>
                  ${prof}
                </h4>
              </div>
              ${staysHtml}
              ${buttonHtml}
            `;
        customListViewEl.appendChild(card);
      });
    });
  }

  // Fonction pour afficher les cours dans la modal
  function showCourses(profName) {
    modalTitle.textContent = `Cours de ${profName}`;
    modalBody.innerHTML = '';
    const courses = professorCourses[profName];

    if (courses && courses.length > 0) {
      const table = document.createElement('div');
      table.className = 'course-table';
      table.innerHTML = `
            <div class="course-header">
              <span class="course-code-col">Code</span>
              <span class="course-title-col">Titre</span>
              <span class="course-date-col">Date</span>
              <span class="course-time-col">Heures</span>
            </div>
          `;
      courses.forEach(course => {
        const row = document.createElement('div');
        row.className = 'course-row';
        row.innerHTML = `
              <span class="course-code-col">${course.course}</span>
              <span class="course-title-col">${course.title}</span>
              <span class="course-date-col">${course.start}</span>
              <span class="course-time-col">${course.startTime} - ${course.endTime}</span>
            `;
        table.appendChild(row);
      });
      modalBody.appendChild(table);
    } else {
      modalBody.innerHTML = `<p class="no-data"><i class="fas fa-exclamation-circle"></i>Aucun cours n'a été trouvé pour ${profName}.</p>`;
    }
    courseModal.classList.add('active');
  }

  // Fonction pour afficher le calendrier des cours dans la modal
  function showCourseCalendar(profName) {
    modalTitle.textContent = `Calendrier des cours de ${profName}`;
    modalBody.innerHTML = ''; // Vider le contenu précédent
    const courses = professorCourses[profName];

    if (!courses || courses.length === 0) {
      modalBody.innerHTML = `<p class="no-data"><i class="fas fa-exclamation-circle"></i>Aucun cours n'a été trouvé pour ${profName}.</p>`;
      courseModal.classList.add('active');
      return;
    }

    const modalCalendarEl = document.createElement('div');
    modalBody.appendChild(modalCalendarEl);

    const courseEvents = courses.map(course => {
      const [day, month, year] = course.start.split('/');
      const startDateTime = `${year}-${month}-${day}T${course.startTime}:00`;
      const endDateTime = `${year}-${month}-${day}T${course.endTime}:00`;

      return {
        title: `${course.course}: ${course.title}`,
        start: startDateTime,
        end: endDateTime,
        extendedProps: {
          courseCode: course.course
        },
      };
    }).filter(event => event.start && event.end);

    courseModal.classList.add('active');

    // Utiliser un petit délai pour garantir que la modale est visible et que le calendrier peut calculer ses dimensions.
    setTimeout(() => {
      const modalCalendar = new FullCalendar.Calendar(modalCalendarEl, {
        initialView: 'timeGridWeek',
        locale: 'fr',
        headerToolbar: {
          left: 'prev,next today',
          center: 'title',
          right: 'dayGridMonth,timeGridWeek,listWeek'
        },
        events: courseEvents,
        eventContent: function(arg) {
          const time = arg.timeText ? `<div class="fc-event-time">${arg.timeText}</div>` : '';
          const titleText = arg.view.type === 'dayGridMonth' ?
            arg.event.extendedProps.courseCode :
            arg.event.title;
          const title = `<div class="fc-event-title">${titleText}</div>`;
          return {
            html: time + title
          };
        },
        weekends: true,
        height: 'auto',
        allDaySlot: false,
        noEventsContent: 'Aucun cours pour cette période'
      });
      modalCalendar.render();
    }, 50);
  }

  // Fonction pour afficher le calendrier des séjours dans la modal
  function showStayCalendar(profName) {
    modalTitle.textContent = `Calendrier des séjours de ${profName}`;
    modalBody.innerHTML = ''; // Vider le contenu précédent

    // Filtrer les événements de séjour pour le professeur sélectionné
    const stayEvents = allEvents.filter(event => event.extendedProps.professor === profName);

    if (!stayEvents || stayEvents.length === 0) {
      modalBody.innerHTML = `<p class="no-data"><i class="fas fa-exclamation-circle"></i>Aucun séjour n'a été trouvé pour ${profName}.</p>`;
      courseModal.classList.add('active');
      return;
    }

    const modalCalendarEl = document.createElement('div');
    modalBody.appendChild(modalCalendarEl);

    courseModal.classList.add('active');

    // Utiliser un petit délai pour garantir que la modale est visible et que le calendrier peut calculer ses dimensions.
    setTimeout(() => {
      const modalCalendar = new FullCalendar.Calendar(modalCalendarEl, {
        initialView: 'dayGridMonth',
        locale: 'fr',
        headerToolbar: {
          left: 'prev,next today',
          center: 'title',
          right: 'dayGridMonth,listWeek'
        },
        events: stayEvents,
        weekends: true,
        height: 'auto',
        noEventsContent: 'Aucun séjour pour cette période'
      });
      modalCalendar.render();
    }, 50);
  }

  // Charger les données des séjours
  fetch(STAY_DATA_URL)
    .then(response => response.text())
    .then(csvText => {
      const rows = csvText.split("\n").map(r => r.split(","));

      rows.slice(1).forEach(row => {
        const professor = cleanText(row[0]);
        if (professor) console.log(`[Fichier Séjours] Professeur trouvé : "${professor}"`);
        const stays = row.slice(1).filter(Boolean).map(cleanText);

        if (!professorStays[professor]) {
          professorStays[professor] = [];
        }

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
              extendedProps: {
                professor,
                stay
              }
            });
            professorStays[professor].push({
              start: startStr,
              end: endStr
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
        weekends: true,
        headerToolbar: {
          left: "prev,next today",
          center: "title",
          right: "dayGridMonth"
        },
        events: (info, successCallback) => {
          successCallback(
            allEvents.filter(e => activeProfessors.has(e.extendedProps.professor))
          );
        },
        eventClick: function (info) {
          const profName = info.event.extendedProps.professor;
          const stays = professorStays[profName];
          let message = `Séjours pour ${profName}:\n\n`;
          stays.forEach(stay => {
            message += `• Du ${stay.start} au ${stay.end}\n`;
          });
          alert(message);
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
          if (customListViewEl.style.display === "block") {
            generateMonthlyListView();
          }
        });
      });

      // Écouteur pour la recherche
      professorSearch.addEventListener('input', filterProfessors);

      // Tout sélectionner / Tout désélectionner
      document.getElementById("selectAll").addEventListener("click", () => {
        activeProfessors.clear();
        Object.keys(professorColors).forEach(prof => {
          activeProfessors.add(prof);
          document.getElementById(`chk-${prof}`).checked = true;
        });
        calendar.refetchEvents();
        if (customListViewEl.style.display === "block") {
          generateMonthlyListView();
        }
      });

      document.getElementById("deselectAll").addEventListener("click", () => {
        activeProfessors.clear();
        Object.keys(professorColors).forEach(prof => {
          document.getElementById(`chk-${prof}`).checked = false;
        });
        calendar.refetchEvents();
        if (customListViewEl.style.display === "block") {
          generateMonthlyListView();
        }
      });

      // Logique pour afficher la vue de liste personnalisée
      document.getElementById("showListView").addEventListener("click", () => {
        calendarEl.style.display = "none";
        customListViewEl.style.display = "block";
        document.getElementById("showListView").classList.add("active");
        document.getElementById("showCalendarView").classList.remove("active");
        generateMonthlyListView();
      });

      // Logique pour revenir à la vue du calendrier
      document.getElementById("showCalendarView").addEventListener("click", () => {
        calendarEl.style.display = "block";
        customListViewEl.style.display = "none";
        document.getElementById("showCalendarView").classList.add("active");
        document.getElementById("showListView").classList.remove("active");

         setTimeout(() => calendar.updateSize(), 10); 
      });

      // Écouteur d'événement pour le changement de mois
      monthFilter.addEventListener("change", generateMonthlyListView);

      // Fermer la modal
      closeButton.addEventListener('click', () => {
        courseModal.classList.remove('active');
      });

      window.addEventListener('click', (event) => {
        if (event.target === courseModal) {
          courseModal.classList.remove('active');
        }
      });

      // Gérer les clics sur les boutons via la délégation d'événements
      customListViewEl.addEventListener('click', (event) => {
        const listButton = event.target.closest('.view-courses-list-btn');
        if (listButton) {
          const profName = listButton.dataset.prof;
          if (profName) {
            showCourses(profName); // Affiche la liste
          }
          return;
        }

        const calendarButton = event.target.closest('.view-courses-calendar-btn');
        if (calendarButton) {
          const profName = calendarButton.dataset.prof;
          if (profName) {
            showCourseCalendar(profName); // Affiche le calendrier
          }
          return;
        }

        const staysCalendarButton = event.target.closest('.view-stays-calendar-btn');
        if (staysCalendarButton) {
          const profName = staysCalendarButton.dataset.prof;
          if (profName) {
            showStayCalendar(profName);
          }
        }
      });

      // Appeler les fonctions au chargement initial
      populateMonthFilter();
      // Si la vue en liste est affichée par défaut, on la génère immédiatement.
      if (customListViewEl.style.display === "block") {
        generateMonthlyListView();
      }
    })
    .catch(error => {
      console.error("Erreur lors du chargement des données:", error);
      customListViewEl.innerHTML = `
        <div class="no-data">
          <i class="fas fa-exclamation-triangle"></i>
          <p>Erreur lors du chargement des données. Veuillez réessayer.</p>
        </div>
      `;
    });
    
  // Charger les données des cours après le chargement des séjours
  fetchCourseData();
});