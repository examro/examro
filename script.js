// --- STATE MANAGEMENT ---
let subjectList = [];
let currentSubjectFolder = "";
let availableChapters = [];
let currentExamQuestions = [];
let userAnswers = [];

// Queue System for Questions
let questionQueue = []; // Holds indices of questions to visit [0, 1, 2, ...]
let queuePosition = 0;  // Current pointer in the queue

let totalTimeSeconds = 0;
let timeRemaining = 0;
let timerInterval = null;

// --- DOM ELEMENTS ---
const subjectSelect = document.getElementById('subject-select');
const chapterGroup = document.getElementById('chapter-group');
const chapterList = document.getElementById('chapter-list');
const startBtn = document.getElementById('start-btn');
const qCountInput = document.getElementById('q-count-input');

const setupSection = document.getElementById('setup-section');
const examSection = document.getElementById('exam-section');
const resultSection = document.getElementById('result-section');

const questionText = document.getElementById('question-text');
const optionsContainer = document.getElementById('options-container');
const nextBtn = document.getElementById('next-btn');
const prevBtn = document.getElementById('prev-btn');
const finishBtn = document.getElementById('finish-btn');
const finishBtnTop = document.getElementById('finish-btn-top');

const currentQNum = document.getElementById('current-q-num');
const totalQNum = document.getElementById('final-total'); 
const timerDisplay = document.getElementById('timer-display');
const timerDisplayNav = document.getElementById('timer-display-nav');

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', loadSubjectMenu);

async function loadSubjectMenu() {
    try {
        const response = await fetch('data/subjects.json');
        if (!response.ok) throw new Error("No subject file");
        subjectList = await response.json();
        
        subjectSelect.innerHTML = '<option value="">-- Select Subject --</option>';
        subjectList.forEach(sub => {
            const option = document.createElement('option');
            option.value = sub.folder;
            option.textContent = sub.name;
            subjectSelect.appendChild(option);
        });
        subjectSelect.addEventListener('change', handleSubjectSelection);
    } catch (e) {
        console.warn("Server mode not detected. Enabling Demo Mode.");
        // Demo Data for testing without server
        subjectList = [{name: "General Knowledge (Demo)", folder: "demo"}];
        subjectSelect.innerHTML = '<option value="">-- Select Subject --</option>';
        subjectSelect.appendChild(new Option("General Knowledge (Demo)", "demo"));
        subjectSelect.addEventListener('change', handleSubjectSelection);
    }
}

async function handleSubjectSelection() {
    const folder = subjectSelect.value;
    chapterList.innerHTML = '';
    chapterGroup.style.display = 'none';
    startBtn.disabled = true;
    currentSubjectFolder = folder;
    
    if(!folder) return;

    try {
        const res = await fetch(`data/${folder}/index.json`);
        availableChapters = await res.json();
        generateChapterList();
    } catch (e) {
        // Fallback for Demo
        availableChapters = [
            {file: "ch1.json", name: "Chapter 1: Basics"},
            {file: "ch2.json", name: "Chapter 2: Advanced"}
        ];
        generateChapterList();
    }
}

function generateChapterList() {
    availableChapters.forEach(chap => {
        const div = document.createElement('div');
        div.className = 'checkbox-item';
        div.innerHTML = `
            <input type="checkbox" id="ch-${chap.file}" value="${chap.file}" class="chapter-checkbox">
            <label for="ch-${chap.file}">${chap.name}</label>
        `;
        // Allow clicking row to toggle checkbox
        div.addEventListener('click', (e) => {
            if(e.target.tagName !== 'INPUT') {
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
    const selectedFiles = Array.from(document.querySelectorAll('.chapter-checkbox:checked')).map(cb => cb.value);
    let count = parseInt(qCountInput.value) || 20;

    startBtn.innerHTML = '<i class="ph ph-spinner ph-spin"></i> Loading...';
    
    try {
        let allQuestions = [];
        
        // Try fetching real data
        try {
            if(currentSubjectFolder === "demo") throw new Error("Demo");
            const promises = selectedFiles.map(f => fetch(`data/${currentSubjectFolder}/${f}`).then(r => r.json()));
            const results = await Promise.all(promises);
            results.forEach(d => allQuestions = allQuestions.concat(d));
        } catch(e) {
            // Generate Demo Questions
            for(let i=0; i<50; i++) allQuestions.push({
                question: `This is demo question #${i+1}. The answer is 'Correct'.`,
                options: ["Wrong One", "Correct", "Another Wrong", "Totally Wrong"],
                correct: "Correct",
                explanation: "This is a demo explanation."
            });
        }

        if(allQuestions.length === 0) throw new Error("No questions");

        // Shuffle Questions
        for (let i = allQuestions.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [allQuestions[i], allQuestions[j]] = [allQuestions[j], allQuestions[i]];
        }
        
        // Slice to requested amount
        currentExamQuestions = allQuestions.slice(0, count);

        initExamState();

    } catch (e) {
        alert("Error starting exam. Please check console.");
        console.error(e);
        startBtn.innerHTML = 'Start Exam <i class="ph-bold ph-arrow-right"></i>';
    }
}

function initExamState() {
    userAnswers = new Array(currentExamQuestions.length).fill(null);
    
    // Initialize Queue: [0, 1, 2, ... total-1]
    questionQueue = Array.from({length: currentExamQuestions.length}, (_, i) => i);
    queuePosition = 0;

    totalTimeSeconds = currentExamQuestions.length * 60; // 1 min per q
    timeRemaining = totalTimeSeconds;

    setupSection.classList.add('hidden');
    examSection.classList.remove('hidden');
    
    startTimer();
    loadQuestion(questionQueue[0]);
}

// --- NAVIGATION & DISPLAY ---
function loadQuestion(rawIndex) {
    const qData = currentExamQuestions[rawIndex];
    
    currentQNum.textContent = rawIndex + 1; // Show actual ID
    questionText.innerHTML = qData.question;
    optionsContainer.innerHTML = '';

    // Prev Button
    prevBtn.disabled = queuePosition === 0;

    // Next Button Logic
    // If we are at the end of the queue AND the current question is answered: Show Finish
    // Otherwise show Next (which might skip)
    if (queuePosition === questionQueue.length - 1 && userAnswers[rawIndex] !== null) {
        setNextBtnToFinish();
    } else {
        nextBtn.innerHTML = 'Next <i class="ph-bold ph-caret-right"></i>';
        nextBtn.onclick = handleNextClick;
    }

    // Options
    let opts = [...qData.options];
    // Randomize option order
    opts.sort(() => Math.random() - 0.5);

    opts.forEach(opt => {
        const btn = document.createElement('button');
        btn.className = 'option-btn';
        btn.textContent = opt;
        
        if(userAnswers[rawIndex] && userAnswers[rawIndex].selected === opt) {
            btn.classList.add('selected');
        }

        btn.onclick = () => selectOption(btn, opt, qData, rawIndex);
        optionsContainer.appendChild(btn);
    });
}

function selectOption(btn, text, qData, rawIndex) {
    document.querySelectorAll('.option-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    
    userAnswers[rawIndex] = {
        question: qData,
        selected: text,
        isCorrect: text === qData.correct
    };

    // If we just answered the last item in the queue, enable finish
    if (queuePosition === questionQueue.length - 1) {
        setNextBtnToFinish();
    }
}

function handleNextClick() {
    const currentRawIndex = questionQueue[queuePosition];

    // QUEUE LOGIC:
    // If user hasn't answered, push this question index to the end of the line
    if (userAnswers[currentRawIndex] === null) {
        questionQueue.push(currentRawIndex);
    }

    queuePosition++;

    if (queuePosition < questionQueue.length) {
        loadQuestion(questionQueue[queuePosition]);
    } else {
        // Fallback if somehow queue exhausted
        finishExam();
    }
}

prevBtn.addEventListener('click', () => {
    if (queuePosition > 0) {
        queuePosition--;
        loadQuestion(questionQueue[queuePosition]);
    }
});

function setNextBtnToFinish() {
    nextBtn.innerHTML = 'Finish <i class="ph-bold ph-check"></i>';
    nextBtn.onclick = () => finishBtn.click();
}

// --- TIMER & FINISH ---
function startTimer() {
    updateTimeUI();
    timerInterval = setInterval(() => {
        timeRemaining--;
        updateTimeUI();
        if(timeRemaining <= 0) finishExam(true);
    }, 1000);
}

function updateTimeUI() {
    const m = Math.floor(timeRemaining / 60).toString().padStart(2,'0');
    const s = (timeRemaining % 60).toString().padStart(2,'0');
    timerDisplay.textContent = `${m}:${s}`;
    timerDisplayNav.textContent = `${m}:${s}`;
    
    // Warning Color
    if(timeRemaining < 60) {
        timerDisplay.style.color = '#ef4444';
        document.getElementById('nav-timer').style.background = '#ef4444';
    }
}

if(finishBtnTop) finishBtnTop.addEventListener('click', () => finishBtn.click());

finishBtn.addEventListener('click', () => {
    const count = userAnswers.filter(a => a).length;
    if(confirm(`You have answered ${count} out of ${currentExamQuestions.length}. Submit Exam?`)) {
        finishExam();
    }
});

function finishExam(auto) {
    clearInterval(timerInterval);
    if(auto) alert("Time Up! Submitting automatically.");

    examSection.classList.add('hidden');
    resultSection.classList.remove('hidden');

    const valid = userAnswers.filter(a => a !== null);
    const score = valid.filter(a => a.isCorrect).length;
    const total = currentExamQuestions.length;
    const perc = total ? Math.round((score/total)*100) : 0;

    document.getElementById('score-text').textContent = score;
    document.getElementById('final-total').textContent = total;
    document.getElementById('percentage-text').textContent = `${perc}%`;
    
    // Time Taken Calculation
    const taken = totalTimeSeconds - timeRemaining;
    const m = Math.floor(taken/60);
    const s = taken%60;
    document.getElementById('time-taken-text').textContent = `${m}m ${s}s`;

    // Ring Animation
    const circle = document.getElementById('score-ring-stroke');
    const r = circle.r.baseVal.value;
    const c = r * 2 * Math.PI;
    circle.style.strokeDasharray = `${c} ${c}`;
    circle.style.strokeDashoffset = c;
    
    setTimeout(() => {
        circle.style.strokeDashoffset = c - (perc / 100) * c;
        if(perc >= 70) circle.style.stroke = '#10b981'; // Green
        else if(perc >= 40) circle.style.stroke = '#f59e0b'; // Orange
        else circle.style.stroke = '#ef4444'; // Red
    }, 100);

    // Generate Review List
    const list = document.getElementById('review-list');
    list.innerHTML = '';
    currentExamQuestions.forEach((q, i) => {
        const ans = userAnswers[i];
        const isCorrect = ans && ans.isCorrect;
        const statusClass = ans ? (isCorrect ? 'correct' : 'wrong') : 'wrong'; // Skipped counts as wrong usually
        
        const div = document.createElement('div');
        div.className = `review-item ${statusClass}`;
        
        let userAnsText = ans ? ans.selected : 'Skipped';
        let userAnsClass = ans ? (isCorrect ? 'text-success' : 'text-danger') : 'text-danger';

        div.innerHTML = `
            <div class="review-q">${i+1}. ${q.question}</div>
            <div class="review-ans">
                You: <span class="${userAnsClass}">${userAnsText}</span>
            </div>
            <div class="review-ans text-success">
                Correct: ${q.correct}
            </div>
        `;
        list.appendChild(div);
    });
}