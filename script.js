// --- STATE MANAGEMENT ---
let subjectList = [];       
let currentSubjectFolder = "";
let availableChapters = [];
let currentExamQuestions = [];
let userAnswers = []; 
let currentQuestionIndex = 0;

// Timer Variables
let totalTimeSeconds = 0;
let timeRemaining = 0;
let timerInterval = null;

// --- DOM ELEMENTS ---
const setupSection = document.getElementById('setup-section');
const examSection = document.getElementById('exam-section');
const resultSection = document.getElementById('result-section');

const subjectSelect = document.getElementById('subject-select');
const chapterGroup = document.getElementById('chapter-group');
const chapterList = document.getElementById('chapter-list');
const startBtn = document.getElementById('start-btn');
const qCountInput = document.getElementById('q-count-input');

const questionText = document.getElementById('question-text');
const optionsContainer = document.getElementById('options-container');
const nextBtn = document.getElementById('next-btn');
const prevBtn = document.getElementById('prev-btn');
const finishBtn = document.getElementById('finish-btn');
const finishBtnTop = document.getElementById('finish-btn-top'); // Added top button

const currentQNum = document.getElementById('current-q-num');
const totalQNum = document.getElementById('total-q-num');
const timerDisplay = document.getElementById('timer-display');
const timerDisplayNav = document.getElementById('timer-display-nav'); // Nav timer
const navTimerBox = document.getElementById('nav-timer');
const questionPalette = document.getElementById('question-palette');

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    loadSubjectMenu();
});

// 1. Load the main list of subjects
async function loadSubjectMenu() {
    try {
        const response = await fetch('data/subjects.json');
        if (!response.ok) throw new Error("Could not load subject list");
        subjectList = await response.json();
        
        subjectSelect.innerHTML = '<option value="">-- Select Subject --</option>';
        subjectList.forEach(sub => {
            const option = document.createElement('option');
            option.value = sub.folder;
            option.textContent = sub.name;
            subjectSelect.appendChild(option);
        });
        subjectSelect.addEventListener('change', handleSubjectSelection);
    } catch (error) {
        console.error(error);
        // Fallback for demo without server
        alert("System loaded. Please ensure data/subjects.json exists.");
    }
}

// 2. When Subject is selected
async function handleSubjectSelection() {
    const folderName = subjectSelect.value;
    chapterList.innerHTML = '';
    chapterGroup.style.display = 'none';
    startBtn.disabled = true;
    currentSubjectFolder = folderName;

    if (!folderName) return;

    try {
        const res = await fetch(`data/${folderName}/index.json`);
        if (!res.ok) throw new Error(`Could not load chapters for ${folderName}`);
        
        availableChapters = await res.json();
        generateChapterList();
    } catch (error) {
        console.error(error);
        alert("Subject data loaded (Simulated).");
    }
}

// 3. Generate Checkboxes
function generateChapterList() {
    if(availableChapters.length === 0) {
        chapterList.innerHTML = '<div style="padding:10px;">No chapters found.</div>';
        return;
    }

    availableChapters.forEach(chap => {
        const div = document.createElement('div');
        div.className = 'checkbox-item';
        // Add ID to label for accessibility
        const uniqueId = `ch-${chap.file}`;
        div.innerHTML = `
            <input type="checkbox" id="${uniqueId}" value="${chap.file}" class="chapter-checkbox">
            <label for="${uniqueId}">${chap.name}</label>
        `;
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

// --- EXAM START LOGIC ---
startBtn.addEventListener('click', startExam);

async function startExam() {
    const selectedFiles = Array.from(document.querySelectorAll('.chapter-checkbox:checked')).map(cb => cb.value);

    let requestedQCount = parseInt(qCountInput.value);
    if(isNaN(requestedQCount) || requestedQCount < 1) requestedQCount = 20;
    if(requestedQCount > 100) requestedQCount = 100;

    startBtn.innerHTML = '<i class="ph ph-spinner ph-spin"></i> Loading...';
    startBtn.disabled = true;

    try {
        let allQuestions = [];

        const promises = selectedFiles.map(filename => 
            fetch(`data/${currentSubjectFolder}/${filename}`).then(res => {
                if(!res.ok) throw new Error(`Failed`);
                return res.json();
            })
        );

        const results = await Promise.all(promises);
        results.forEach(data => { allQuestions = allQuestions.concat(data); });

        if (allQuestions.length === 0) {
            alert("No questions found.");
            resetStartBtn();
            return;
        }

        shuffleArray(allQuestions);
        const finalLength = Math.min(allQuestions.length, requestedQCount);
        currentExamQuestions = allQuestions.slice(0, finalLength); 
        
        setupExamState();

    } catch (error) {
        console.error(error);
        // alert("Error loading files.");
        resetStartBtn();
    }
}

function resetStartBtn() {
    startBtn.innerHTML = 'Start Exam <i class="ph-bold ph-arrow-right"></i>';
    startBtn.disabled = false;
}

function setupExamState() {
    userAnswers = new Array(currentExamQuestions.length).fill(null);
    currentQuestionIndex = 0;
    
    totalTimeSeconds = currentExamQuestions.length * 60;
    timeRemaining = totalTimeSeconds;

    totalQNum.textContent = currentExamQuestions.length;
    setupSection.classList.add('hidden');
    examSection.classList.remove('hidden');
    navTimerBox.style.display = 'flex'; // Show nav timer
    
    generatePaletteButtons();
    startTimer();
    loadQuestion(0);
}

// --- TIMER LOGIC ---
function startTimer() {
    updateTimerDisplay();
    timerInterval = setInterval(() => {
        timeRemaining--;
        updateTimerDisplay();
        if (timeRemaining <= 0) {
            clearInterval(timerInterval);
            finishExam(true);
        }
    }, 1000);
}

function updateTimerDisplay() {
    const m = Math.floor(timeRemaining / 60);
    const s = timeRemaining % 60;
    const text = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    
    timerDisplay.textContent = text;
    timerDisplayNav.textContent = text;
    
    if(timeRemaining < 60) {
        timerDisplay.style.color = '#ef4444'; 
        navTimerBox.style.background = 'rgba(239, 68, 68, 0.2)';
    }
}

// --- NAVIGATION ---
function generatePaletteButtons() {
    questionPalette.innerHTML = '';
    currentExamQuestions.forEach((_, i) => {
        const btn = document.createElement('button');
        btn.className = 'pal-btn';
        btn.textContent = i + 1;
        btn.onclick = () => loadQuestion(i);
        btn.id = `pal-btn-${i}`;
        questionPalette.appendChild(btn);
    });
}

function updatePaletteUI() {
    document.querySelectorAll('.pal-btn').forEach(b => b.classList.remove('current'));
    const currentBtn = document.getElementById(`pal-btn-${currentQuestionIndex}`);
    if(currentBtn) {
        currentBtn.classList.add('current');
        currentBtn.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    userAnswers.forEach((ans, i) => {
        const btn = document.getElementById(`pal-btn-${i}`);
        if(ans !== null) btn.classList.add('answered');
    });
}

function loadQuestion(index) {
    currentQuestionIndex = index;
    const qData = currentExamQuestions[index];
    
    currentQNum.textContent = index + 1;
    questionText.innerHTML = qData.question;
    optionsContainer.innerHTML = '';

    prevBtn.disabled = index === 0;
    // Fix: Next button logic
    if(index === currentExamQuestions.length - 1) {
        nextBtn.innerHTML = 'Finish <i class="ph-bold ph-check"></i>';
        nextBtn.onclick = () => finishBtn.click();
    } else {
        nextBtn.innerHTML = 'Next <i class="ph-bold ph-caret-right"></i>';
        nextBtn.onclick = () => loadQuestion(currentQuestionIndex + 1);
    }

    // Create Options
    let options = [...qData.options];
    shuffleArray(options); 

    options.forEach(opt => {
        const btn = document.createElement('button');
        btn.className = 'option-btn';
        btn.textContent = opt;
        
        if (userAnswers[index] && userAnswers[index].selected === opt) {
            btn.classList.add('selected');
        }

        btn.onclick = () => selectOption(btn, opt, qData);
        optionsContainer.appendChild(btn);
    });

    updatePaletteUI();
}

function selectOption(btn, selectedText, qData) {
    document.querySelectorAll('.option-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    
    userAnswers[currentQuestionIndex] = {
        question: qData,
        selected: selectedText,
        isCorrect: selectedText === qData.correct
    };

    updatePaletteUI();
}

// --- NAVIGATION HANDLERS ---
prevBtn.addEventListener('click', () => {
    if (currentQuestionIndex > 0) loadQuestion(currentQuestionIndex - 1);
});

// Added top button support
if(finishBtnTop) {
    finishBtnTop.addEventListener('click', () => finishBtn.click());
}

finishBtn.addEventListener('click', () => {
    const answeredCount = userAnswers.filter(a => a !== null).length;
    if(confirm(`You answered ${answeredCount} of ${currentExamQuestions.length} questions.\nSubmit Exam?`)) {
        finishExam(false);
    }
});

// --- RESULTS ---
function finishExam(forced) {
    clearInterval(timerInterval);
    navTimerBox.style.display = 'none';
    
    if(forced) alert("Time Up! Submitting automatically.");

    examSection.classList.add('hidden');
    resultSection.classList.remove('hidden');

    const validAnswers = userAnswers.filter(a => a !== null);
    const score = validAnswers.filter(a => a.isCorrect).length;
    const total = currentExamQuestions.length;
    const percentage = total > 0 ? Math.round((score / total) * 100) : 0;
    const timeTaken = totalTimeSeconds - timeRemaining;

    const m = Math.floor(timeTaken / 60);
    const s = timeTaken % 60;

    document.getElementById('score-text').textContent = score;
    document.getElementById('final-total').textContent = total;
    document.getElementById('percentage-text').textContent = `${percentage}%`;
    document.getElementById('time-taken-text').textContent = `${m}m ${s}s`;

    // Circular Progress Animation
    const circle = document.getElementById('score-ring-stroke');
    const radius = circle.r.baseVal.value;
    const circumference = radius * 2 * Math.PI;
    
    circle.style.strokeDasharray = `${circumference} ${circumference}`;
    circle.style.strokeDashoffset = circumference;

    const offset = circumference - (percentage / 100) * circumference;
    // Small delay to allow CSS transition
    setTimeout(() => {
        circle.style.strokeDashoffset = offset;
        // Color coding ring
        if(percentage < 40) circle.style.stroke = 'var(--error)';
        else if(percentage < 70) circle.style.stroke = 'var(--warning)';
        else circle.style.stroke = 'var(--success)';
    }, 100);

    renderReview();
}

function renderReview() {
    const list = document.getElementById('review-list');
    list.innerHTML = '';

    currentExamQuestions.forEach((q, i) => {
        const answerData = userAnswers[i];
        const isAnswered = answerData !== null;
        const isCorrect = isAnswered ? answerData.isCorrect : false;
        
        const item = document.createElement('div');
        item.className = `review-item ${isCorrect ? 'correct' : 'wrong'}`;

        let statusBadge = isCorrect 
            ? '<span class="badge badge-correct">Correct</span>' 
            : '<span class="badge badge-wrong">Wrong</span>';

        if (!isAnswered) statusBadge = '<span class="badge badge-skipped">Skipped</span>';

        item.innerHTML = `
            <div class="review-q">${i + 1}. ${q.question} ${statusBadge}</div>
            <div class="review-ans">
                <strong>You:</strong> 
                <span class="${isCorrect ? 'text-success' : 'text-danger'}">
                    ${isAnswered ? answerData.selected : 'No Answer'}
                </span>
            </div>
            <div class="review-ans text-success">
                <strong>Answer:</strong> ${q.correct}
            </div>
            <div class="review-exp" style="margin-top:10px; font-size:0.9rem; color:#666;">
                <strong><i class="ph-bold ph-info"></i> Note:</strong> ${q.explanation || 'No explanation available.'}
            </div>
        `;
        list.appendChild(item);
    });
}

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}