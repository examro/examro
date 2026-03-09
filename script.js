// --- STATE ---
let currentCategory = "";
let subjectList = [];
let currentSubjectFolder = "";
let availableChapters = [];
let currentExamQuestions = [];
let userAnswers = [];

let questionQueue = [];
let queuePosition = 0;

let totalTimeSeconds = 0;
let timeRemaining = 0;
let timerInterval = null;
let timerTotalSeconds = 0;

// --- DOM ---
const subjectSelect    = document.getElementById('subject-select');
const chapterGroup     = document.getElementById('chapter-group');
const chapterList      = document.getElementById('chapter-list');
const startBtn         = document.getElementById('start-btn');
const qCountInput      = document.getElementById('q-count-input');

const categorySection  = document.getElementById('category-section');
const setupSection     = document.getElementById('setup-section');
const examSection      = document.getElementById('exam-section');
const resultSection    = document.getElementById('result-section');

const questionText     = document.getElementById('question-text');
const optionsContainer = document.getElementById('options-container');
const nextBtn          = document.getElementById('next-btn');
const prevBtn          = document.getElementById('prev-btn');
const finishBtnMain    = document.getElementById('finish-btn-main');

const currentQNum      = document.getElementById('current-q-num');
const timerDisplay     = document.getElementById('timer-display');
const timerDisplayNav  = document.getElementById('timer-display-nav');

// Category labels for UI
const CATEGORY_LABELS = {
    ssc:        { name: "SSC",                icon: "ph-book-open-text" },
    hsc:        { name: "HSC",                icon: "ph-student" },
    medical:    { name: "Medical Admission",  icon: "ph-heartbeat" },
    university: { name: "University Admission", icon: "ph-buildings" },
};

// --- CATEGORY SELECTION ---
function selectCategory(cat) {
    // Only SSC is active right now
    if (cat !== 'ssc') {
        showComingSoonToast(CATEGORY_LABELS[cat]?.name || cat);
        return;
    }

    currentCategory = cat;

    // Update nav badge and breadcrumb
    const label = CATEGORY_LABELS[cat].name;
    document.getElementById('nav-category-badge').textContent = label;
    document.getElementById('bc-category').textContent = label;
    document.getElementById('setup-label').innerHTML =
        `<i class="ph ph-sparkle"></i> ${label} Preparation`;

    // Switch screens
    categorySection.classList.add('hidden');
    setupSection.classList.remove('hidden');

    loadSubjectMenu();
}

function showComingSoonToast(name) {
    // Remove existing toast
    const old = document.getElementById('toast');
    if (old) old.remove();

    const toast = document.createElement('div');
    toast.id = 'toast';
    toast.innerHTML = `<i class="ph ph-clock"></i> <strong>${name}</strong> is coming soon! Stay tuned.`;
    document.body.appendChild(toast);

    // Auto remove
    setTimeout(() => toast.classList.add('toast-show'), 10);
    setTimeout(() => {
        toast.classList.remove('toast-show');
        setTimeout(() => toast.remove(), 400);
    }, 3000);
}

// --- LOAD SUBJECTS ---
async function loadSubjectMenu() {
    subjectSelect.innerHTML = '<option value="">Choose a subject...</option>';
    chapterGroup.style.display = 'none';
    chapterList.innerHTML = '';
    startBtn.disabled = true;

    try {
        const response = await fetch(`data/${currentCategory}/subjects.json`);
        if (!response.ok) throw new Error("No subjects file");
        subjectList = await response.json();

        subjectList.forEach(sub => {
            const option = document.createElement('option');
            option.value = sub.folder;
            option.textContent = sub.name;
            subjectSelect.appendChild(option);
        });
    } catch (e) {
        console.warn("Could not load subjects.json, using demo.");
        subjectList = [{ name: "General Knowledge (Demo)", folder: "demo" }];
        subjectSelect.appendChild(new Option("General Knowledge (Demo)", "demo"));
    }

    subjectSelect.addEventListener('change', handleSubjectSelection);
}

// --- SUBJECT SELECTION ---
async function handleSubjectSelection() {
    const folder = subjectSelect.value;
    chapterList.innerHTML = '';
    chapterGroup.style.display = 'none';
    startBtn.disabled = true;
    currentSubjectFolder = folder;

    if (!folder) return;

    try {
        const res = await fetch(`data/${currentCategory}/${folder}/index.json`);
        if (!res.ok) throw new Error("No index");
        availableChapters = await res.json();
        generateChapterList();
    } catch (e) {
        console.warn("Could not load chapter index, using demo chapters.");
        availableChapters = [
            { file: "ch1.json", name: "Chapter 1: Basics" },
            { file: "ch2.json", name: "Chapter 2: Advanced" },
        ];
        generateChapterList();
    }
}

// --- CHAPTER LIST ---
function generateChapterList() {
    availableChapters.forEach(chap => {
        const div = document.createElement('div');
        div.className = 'checkbox-item';
        div.innerHTML = `
            <input type="checkbox" id="ch-${chap.file}" value="${chap.file}" class="chapter-checkbox">
            <label for="ch-${chap.file}">${chap.name}</label>
        `;
        div.addEventListener('click', (e) => {
            if (e.target.tagName !== 'INPUT') {
                const cb = div.querySelector('input');
                cb.checked = !cb.checked;
                cb.dispatchEvent(new Event('change'));
            }
        });
        chapterList.appendChild(div);
    });

    chapterGroup.style.display = 'block';

    document.querySelectorAll('.chapter-checkbox').forEach(box => {
        box.addEventListener('change', () => {
            const anyChecked = document.querySelectorAll('.chapter-checkbox:checked').length > 0;
            startBtn.disabled = !anyChecked;
        });
    });
}

// --- START EXAM ---
startBtn.addEventListener('click', startExam);

async function startExam() {
    const selectedFiles = Array.from(
        document.querySelectorAll('.chapter-checkbox:checked')
    ).map(cb => cb.value);

    let count = parseInt(qCountInput.value) || 20;
    startBtn.innerHTML = '<i class="ph ph-spinner ph-spin"></i> Loading...';

    try {
        let allQuestions = [];
        try {
            if (currentSubjectFolder === "demo") throw new Error("Demo");

            const promises = selectedFiles.map(f =>
                fetch(`data/${currentCategory}/${currentSubjectFolder}/${f}`).then(r => r.json())
            );
            const results = await Promise.all(promises);
            results.forEach(d => allQuestions = allQuestions.concat(d));
        } catch (e) {
            // Demo fallback
            for (let i = 0; i < 50; i++) allQuestions.push({
                question: `Demo Question ${i + 1}. Which option is correct?`,
                options: ["Option A", "Option B", "Correct Answer", "Option D"],
                correct: "Correct Answer",
                explanation: "This is a demo explanation."
            });
        }

        if (allQuestions.length === 0) throw new Error("No questions found.");

        // Shuffle
        for (let i = allQuestions.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [allQuestions[i], allQuestions[j]] = [allQuestions[j], allQuestions[i]];
        }

        currentExamQuestions = allQuestions.slice(0, count);
        initExamState();

    } catch (e) {
        console.error(e);
        alert("Error starting exam. Please check the console.");
        startBtn.innerHTML = '<span>Begin Exam</span><div class="btn-arrow"><i class="ph-bold ph-arrow-right"></i></div>';
    }
}

// --- INIT EXAM ---
function initExamState() {
    userAnswers  = new Array(currentExamQuestions.length).fill(null);
    questionQueue = Array.from({ length: currentExamQuestions.length }, (_, i) => i);
    queuePosition = 0;
    totalTimeSeconds  = currentExamQuestions.length * 60;
    timerTotalSeconds = totalTimeSeconds;
    timeRemaining     = totalTimeSeconds;

    setupSection.classList.add('hidden');
    examSection.classList.remove('hidden');

    startTimer();
    loadQuestion(questionQueue[0]);
}

// --- LOAD QUESTION ---
function loadQuestion(rawIndex) {
    const qData = currentExamQuestions[rawIndex];
    currentQNum.textContent = rawIndex + 1;
    questionText.innerHTML  = qData.question;
    optionsContainer.innerHTML = '';

    prevBtn.disabled = queuePosition === 0;

    if (queuePosition === questionQueue.length - 1 && userAnswers[rawIndex] !== null) {
        nextBtn.innerHTML = 'Finish <i class="ph-bold ph-check"></i>';
        nextBtn.onclick = () => finishBtnMain.click();
    } else {
        nextBtn.innerHTML = 'Next <i class="ph-bold ph-caret-right"></i>';
        nextBtn.onclick = handleNextClick;
    }

    // Shuffle options
    let opts = [...qData.options];
    opts.sort(() => Math.random() - 0.5);

    opts.forEach(opt => {
        const btn = document.createElement('button');
        btn.className = 'option-btn';
        btn.textContent = opt;

        if (userAnswers[rawIndex] && userAnswers[rawIndex].selected === opt) {
            btn.classList.add('selected');
        }

        btn.onclick = () => selectOption(btn, opt, qData, rawIndex);
        optionsContainer.appendChild(btn);
    });
}

// --- SELECT OPTION ---
function selectOption(btn, text, qData, rawIndex) {
    document.querySelectorAll('.option-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');

    userAnswers[rawIndex] = {
        question: qData,
        selected: text,
        isCorrect: text === qData.correct
    };

    if (queuePosition === questionQueue.length - 1) {
        nextBtn.innerHTML = 'Finish <i class="ph-bold ph-check"></i>';
        nextBtn.onclick = () => finishBtnMain.click();
    }
}

// --- NEXT ---
function handleNextClick() {
    const currentRawIndex = questionQueue[queuePosition];
    if (userAnswers[currentRawIndex] === null) {
        questionQueue.push(currentRawIndex);
    }
    queuePosition++;
    if (queuePosition < questionQueue.length) {
        loadQuestion(questionQueue[queuePosition]);
    } else {
        finishExam();
    }
}

// --- PREV ---
prevBtn.addEventListener('click', () => {
    if (queuePosition > 0) {
        queuePosition--;
        loadQuestion(questionQueue[queuePosition]);
    }
});

// --- TIMER ---
function startTimer() {
    updateTimeUI();
    timerInterval = setInterval(() => {
        timeRemaining--;
        updateTimeUI();
        if (timeRemaining <= 0) finishExam(true);
    }, 1000);
}

function updateTimeUI() {
    const m = Math.floor(timeRemaining / 60).toString().padStart(2, '0');
    const s = (timeRemaining % 60).toString().padStart(2, '0');
    timerDisplay.textContent    = `${m}:${s}`;
    timerDisplayNav.textContent = `${m}:${s}`;

    // Ring countdown
    const ringEl = document.getElementById('timer-ring-fill');
    if (ringEl) {
        const circumference = 2 * Math.PI * 34; // r=34
        const progress = timeRemaining / timerTotalSeconds;
        ringEl.style.strokeDasharray  = circumference;
        ringEl.style.strokeDashoffset = circumference * (1 - progress);
    }

    if (timeRemaining < 60) {
        timerDisplay.style.color = '#f87171';
        if (ringEl) ringEl.style.stroke = '#f87171';
        const navTimer = document.getElementById('nav-timer');
        if (navTimer) navTimer.style.borderColor = 'rgba(248,113,113,0.5)';
    }
}

// --- SUBMIT ---
finishBtnMain.addEventListener('click', () => {
    const count = userAnswers.filter(a => a).length;
    if (confirm(`You have answered ${count} of ${currentExamQuestions.length} questions.\n\nSubmit exam now?`)) {
        finishExam();
    }
});

// --- FINISH ---
function finishExam(auto = false) {
    clearInterval(timerInterval);
    if (auto) alert("Time's up! Your exam has been submitted automatically.");

    examSection.classList.add('hidden');
    resultSection.classList.remove('hidden');

    const valid  = userAnswers.filter(a => a !== null);
    const score  = valid.filter(a => a.isCorrect).length;
    const total  = currentExamQuestions.length;
    const perc   = total ? Math.round((score / total) * 100) : 0;

    document.getElementById('score-text').textContent    = score;
    document.getElementById('final-total').textContent   = total;
    document.getElementById('percentage-text').textContent = `${perc}%`;

    const taken = totalTimeSeconds - timeRemaining;
    document.getElementById('time-taken-text').textContent =
        `${Math.floor(taken / 60)}m ${taken % 60}s`;

    // Animate ring
    const circle = document.getElementById('score-ring-stroke');
    const r = circle.r.baseVal.value;
    const c = r * 2 * Math.PI;
    circle.style.strokeDasharray  = `${c} ${c}`;
    circle.style.strokeDashoffset = c;

    setTimeout(() => {
        circle.style.strokeDashoffset = c - (perc / 100) * c;
        circle.style.stroke =
            perc >= 70 ? '#0fd4a0' :
            perc >= 40 ? '#fbbf24' : '#f87171';
    }, 100);

    // Review list
    const list = document.getElementById('review-list');
    list.innerHTML = '';
    currentExamQuestions.forEach((q, i) => {
        const ans         = userAnswers[i];
        const isCorrect   = ans && ans.isCorrect;
        const statusClass = ans ? (isCorrect ? 'correct' : 'wrong') : 'wrong';
        const userAnsText = ans ? ans.selected : 'Skipped';
        const userClass   = ans ? (isCorrect ? 'text-success' : 'text-danger') : 'text-danger';

        const div = document.createElement('div');
        div.className = `review-item ${statusClass}`;
        div.innerHTML = `
            <div class="review-q">${i + 1}. ${q.question}</div>
            <div class="review-ans">Your answer: <span class="${userClass}">${userAnsText}</span></div>
            <div class="review-ans">Correct answer: <span class="text-success">${q.correct}</span></div>
        `;
        list.appendChild(div);
    });
}