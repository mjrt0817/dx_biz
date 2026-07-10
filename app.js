import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";

(() => {
  const DATA = window.DX_BIZ_DATA;
  const APP_VERSION = '2.2';
  const STORAGE_KEY = 'dxBizTrainerProgress.v1';
  const SESSION_KEY = 'dxBizTrainerCurrentSession.v1';

  const els = {};
  let state = {
    progress: loadProgress(),
    session: null,
    timerId: null,
    timeLeft: 0,
  };

  const firebaseState = {
    enabled: false,
    initialized: false,
    app: null,
    auth: null,
    db: null,
    user: null,
    lastSyncAt: null,
    status: 'Firebase未設定',
  };
  let cloudSaveTimer = null;
  let suppressCloudSave = false;

  document.addEventListener('DOMContentLoaded', init);

  function init() {
    cacheElements();
    bindEvents();
    renderHome();
    renderCategoryScreen();
    renderTermScreen();
    renderAuthPanel();
    initFirebaseSync();
    restoreSessionIfNeeded();
  }

  function cacheElements() {
    const ids = [
      'homeScreen', 'categoryScreen', 'mockScreen', 'termScreen', 'quizScreen', 'resultScreen',
      'totalQuestions', 'answeredCount', 'answeredRatio', 'overallAccuracy', 'scoreLabel', 'scoreHelp',
      'todayRecommendation', 'categorySummary', 'categoryCards', 'termPreview', 'historyList',
      'termSearch', 'termCategoryFilter', 'termList', 'quizModeLabel', 'quizProgress', 'timerDisplay',
      'questionCategory', 'questionDifficulty', 'questionType', 'questionText', 'choices', 'uncertainCheck',
      'answerPanel', 'nextQuestionBtn', 'exitQuizBtn', 'resultPanel', 'resetProgressBtn', 'importProgressBtn', 'importProgressInput', 'exportProgressBtn',
      'authPanel', 'authStatus', 'authUserName', 'authUserEmail', 'loginBtn', 'logoutBtn', 'syncNowBtn', 'pullCloudBtn', 'pushCloudBtn', 'syncTestBtn', 'syncErrorDetail',
      'historyScreen', 'historyDetailList', 'historyCategoryList', 'historyWeakList', 'openHistoryBtn', 'syncStatusBadge'
    ];
    ids.forEach(id => { els[id] = document.getElementById(id); });
  }

  function bindEvents() {
    document.body.addEventListener('click', (e) => {
      const actionBtn = e.target.closest('[data-action]');
      if (actionBtn) {
        const action = actionBtn.dataset.action;
        if (action === 'go-home') showScreen('homeScreen');
        if (action === 'open-categories') showScreen('categoryScreen');
        if (action === 'open-mocks') showScreen('mockScreen');
        if (action === 'open-terms') showScreen('termScreen');
        if (action === 'open-history') showScreen('historyScreen');
        if (action === 'start-daily') startQuiz('今日の10問', selectDailyQuestions(), 0);
        if (action === 'start-weak') startWeakQuiz();
      }

      const categoryBtn = e.target.closest('[data-category-id]');
      if (categoryBtn) {
        const categoryId = categoryBtn.dataset.categoryId;
        const count = Number(categoryBtn.dataset.count || 10);
        startQuiz(`${getCategory(categoryId)?.category_name || '分野別'} ${count}問`, selectCategoryQuestions(categoryId, count), 0);
      }

      const mockBtn = e.target.closest('[data-mock]');
      if (mockBtn) {
        const type = mockBtn.dataset.mock;
        if (type === 'mini') startQuiz('ミニ模試 12問', selectMockQuestions(12), 8 * 60, true);
        if (type === 'half') startQuiz('ハーフ模試 48問', selectMockQuestions(48), 30 * 60, true);
        if (type === 'full') startQuiz('本番模試 96問', selectMockQuestions(96), 60 * 60, true);
      }
    });

    els.nextQuestionBtn.addEventListener('click', goNextQuestion);
    els.exitQuizBtn.addEventListener('click', () => {
      if (confirm('現在の演習を中断してホームへ戻りますか？')) {
        clearCurrentSession();
        showScreen('homeScreen');
      }
    });
    els.termSearch.addEventListener('input', renderTerms);
    els.termCategoryFilter.addEventListener('change', renderTerms);
    els.resetProgressBtn.addEventListener('click', resetProgress);
    els.importProgressBtn.addEventListener('click', () => els.importProgressInput.click());
    els.importProgressInput.addEventListener('change', importProgress);
    els.exportProgressBtn.addEventListener('click', exportProgress);
    els.loginBtn?.addEventListener('click', signInWithGoogle);
    els.logoutBtn?.addEventListener('click', signOutFromGoogle);
    els.syncNowBtn?.addEventListener('click', () => syncWithCloud({ reason: 'manual-merge' }));
    els.pullCloudBtn?.addEventListener('click', pullCloudProgress);
    els.pushCloudBtn?.addEventListener('click', pushCloudProgress);
    els.syncTestBtn?.addEventListener('click', testFirestoreConnection);
  }

  function createBlankProgress() {
    return { questionStats: {}, sessions: [], terms: {}, lastStudyDate: null, updatedAt: null };
  }

  function loadProgress() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      return normalizeProgress(saved);
    } catch (_) {
      return createBlankProgress();
    }
  }

  function normalizeProgress(progress) {
    const blank = createBlankProgress();
    if (!progress || typeof progress !== 'object') return blank;
    const src = progress.progress && typeof progress.progress === 'object' ? progress.progress : progress;
    return {
      questionStats: src.questionStats && typeof src.questionStats === 'object' ? src.questionStats : {},
      sessions: Array.isArray(src.sessions) ? src.sessions : [],
      terms: src.terms && typeof src.terms === 'object' ? src.terms : {},
      lastStudyDate: src.lastStudyDate || null,
      updatedAt: src.updatedAt || null,
    };
  }

  function saveProgress(options = {}) {
    state.progress.updatedAt = new Date().toISOString();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.progress));
    if (!options.skipCloud && !suppressCloudSave) scheduleCloudSave();
  }

  function saveProgressLocalOnly() {
    suppressCloudSave = true;
    try { saveProgress({ skipCloud: true }); } finally { suppressCloudSave = false; }
  }

  function saveCurrentSession() {
    if (!state.session) localStorage.removeItem(SESSION_KEY);
    else localStorage.setItem(SESSION_KEY, JSON.stringify({ ...state.session, timeLeft: state.timeLeft }));
  }

  function clearCurrentSession() {
    state.session = null;
    state.timeLeft = 0;
    if (state.timerId) clearInterval(state.timerId);
    state.timerId = null;
    localStorage.removeItem(SESSION_KEY);
  }

  function restoreSessionIfNeeded() {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (!saved || !saved.questions || saved.finished) return;
      saved.choiceOrders = saved.choiceOrders || {};
      ensureChoiceOrders(saved);
      const shouldRestore = confirm('前回途中の演習があります。再開しますか？');
      if (shouldRestore) {
        state.session = saved;
        state.timeLeft = saved.timeLeft || 0;
        showScreen('quizScreen');
        renderQuestion();
        if (state.session.durationSeconds) startTimer();
      } else {
        clearCurrentSession();
      }
    } catch (_) {
      clearCurrentSession();
    }
  }

  function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    els[id].classList.add('active');
    if (id === 'homeScreen') renderHome();
    if (id === 'categoryScreen') renderCategoryScreen();
    if (id === 'termScreen') renderTermScreen();
    if (id === 'historyScreen') renderHistoryScreen();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function getActiveQuestions() {
    return DATA.questions.filter(q => q.active !== false);
  }

  function getCategory(categoryId) {
    return DATA.categories.find(c => c.category_id === categoryId);
  }

  function getStat(questionId) {
    if (!state.progress.questionStats[questionId]) {
      state.progress.questionStats[questionId] = {
        attempts: 0,
        correct: 0,
        wrong: 0,
        uncertain: 0,
        streak: 0,
        lastAnswer: null,
        lastAnsweredAt: null,
        mastered: false,
      };
    }
    return state.progress.questionStats[questionId];
  }

  function renderHome() {
    const questions = getActiveQuestions();
    const stats = Object.entries(state.progress.questionStats);
    const answeredIds = stats.filter(([_, s]) => s.attempts > 0).map(([id]) => id);
    const totalAttempts = stats.reduce((sum, [_, s]) => sum + (s.attempts || 0), 0);
    const totalCorrect = stats.reduce((sum, [_, s]) => sum + (s.correct || 0), 0);
    const accuracy = totalAttempts ? Math.round(totalCorrect / totalAttempts * 100) : 0;

    els.totalQuestions.textContent = questions.length;
    els.answeredCount.textContent = answeredIds.length;
    els.answeredRatio.textContent = `${Math.round(answeredIds.length / questions.length * 100)}% 学習済み`;
    els.overallAccuracy.textContent = `${accuracy}%`;

    const score = getScoreLabel(accuracy, totalAttempts);
    els.scoreLabel.textContent = score.label;
    els.scoreHelp.textContent = score.help;

    const weakCategories = getWeakCategories().slice(0, 2);
    if (weakCategories.length) {
      els.todayRecommendation.textContent = `苦手傾向は「${weakCategories.map(c => c.name).join('」「')}」です。今日の10問か苦手復習で重点的に確認しましょう。`;
    } else if (answeredIds.length > 0) {
      els.todayRecommendation.textContent = '学習履歴が増えてきました。次は分野別演習で未学習カテゴリを埋めると、模試の安定感が上がります。';
    } else {
      els.todayRecommendation.textContent = 'まずは「今日の10問」から始めましょう。解答後に解説と試験ポイントを確認できます。';
    }

    renderCategorySummary();
    renderTermPreview();
    renderHistory();
    renderAuthPanel();
  }

  function getScoreLabel(accuracy, totalAttempts) {
    if (!totalAttempts) return { label: '未判定', help: 'まずは10問解きましょう' };
    if (accuracy >= 80) return { label: '800点圏', help: 'プロフェッショナル水準の目安' };
    if (accuracy >= 70) return { label: '700点圏', help: 'エキスパート水準の目安' };
    if (accuracy >= 60) return { label: '600点圏', help: '基礎は見えている状態' };
    return { label: '基礎固め', help: '用語と解説の復習を優先' };
  }

  function renderCategorySummary() {
    const html = DATA.categories.map((cat, idx) => {
      const summary = getCategoryStats(cat.category_id);
      return `
        <div class="category-row ${idx > 5 ? 'compact-hidden' : ''}">
          <div class="category-id">${cat.category_id}</div>
          <div>
            <strong>${escapeHtml(cat.category_name)}</strong>
            <div class="progress-bar"><div class="progress-fill" style="width:${summary.answeredRatio}%"></div></div>
          </div>
          <div class="small-stat">${summary.accuracy}% 正答</div>
          <div class="small-stat">${summary.answered}/${summary.total}問</div>
        </div>`;
    }).join('');
    els.categorySummary.innerHTML = html;
  }

  function renderCategoryScreen() {
    els.categoryCards.innerHTML = DATA.categories.map(cat => {
      const summary = getCategoryStats(cat.category_id);
      return `
        <article class="category-card">
          <div class="panel-title-row">
            <div>
              <span class="pill">${cat.category_id}</span>
              <h3>${escapeHtml(cat.category_name)}</h3>
            </div>
            <strong>${summary.accuracy}%</strong>
          </div>
          <p>${escapeHtml(cat.learning_goal || '')}</p>
          <div class="progress-bar"><div class="progress-fill" style="width:${summary.answeredRatio}%"></div></div>
          <p class="muted">学習済み ${summary.answered}/${summary.total}問 ／ 要復習 ${summary.weak}問</p>
          <div class="category-actions">
            <button data-category-id="${cat.category_id}" data-count="10" class="primary">10問</button>
            <button data-category-id="${cat.category_id}" data-count="20" class="secondary">20問</button>
          </div>
        </article>`;
    }).join('');
  }

  function getCategoryStats(categoryId) {
    const questions = getActiveQuestions().filter(q => q.categoryId === categoryId);
    let attempts = 0, correct = 0, answered = 0, weak = 0;
    questions.forEach(q => {
      const s = state.progress.questionStats[q.id];
      if (s && s.attempts > 0) {
        answered += 1;
        attempts += s.attempts;
        correct += s.correct;
        if (isWeakStat(s)) weak += 1;
      }
    });
    return {
      total: questions.length,
      answered,
      answeredRatio: questions.length ? Math.round(answered / questions.length * 100) : 0,
      accuracy: attempts ? Math.round(correct / attempts * 100) : 0,
      weak,
    };
  }

  function getWeakCategories() {
    return DATA.categories.map(cat => {
      const s = getCategoryStats(cat.category_id);
      const unansweredPenalty = 100 - s.answeredRatio;
      const accuracyPenalty = s.answered ? 100 - s.accuracy : 30;
      return { id: cat.category_id, name: cat.category_name, score: unansweredPenalty + accuracyPenalty + s.weak * 10 };
    }).sort((a, b) => b.score - a.score);
  }

  function isWeakStat(s) {
    return (s.wrong || 0) > 0 || (s.uncertain || 0) > 0 || (s.attempts > 0 && (s.correct / s.attempts) < 0.7) || !s.mastered;
  }

  function renderTermPreview() {
    const terms = (DATA.terms || []).slice(0, 4);
    els.termPreview.innerHTML = terms.map(t => `
      <div class="term-chip">
        <strong>${escapeHtml(t.term)}</strong>
        <small>${escapeHtml(t.definition)}</small>
      </div>`).join('') || '<p class="muted">用語データがありません。</p>';
  }

  function renderTermScreen() {
    els.termCategoryFilter.innerHTML = '<option value="">すべてのカテゴリ</option>' + DATA.categories.map(c => `<option value="${c.category_id}">${c.category_id} ${escapeHtml(c.category_name)}</option>`).join('');
    renderTerms();
  }

  function renderTerms() {
    const keyword = (els.termSearch.value || '').trim().toLowerCase();
    const categoryId = els.termCategoryFilter.value;
    const terms = (DATA.terms || []).filter(t => {
      const text = `${t.term} ${t.reading} ${t.definition} ${t.example} ${(t.relatedTerms || []).join(' ')}`.toLowerCase();
      return (!keyword || text.includes(keyword)) && (!categoryId || t.categoryId === categoryId);
    });
    els.termList.innerHTML = terms.map(t => `
      <article class="term-card">
        <span class="pill">${escapeHtml(t.categoryName || '')}</span>
        <h3>${escapeHtml(t.term)}${t.reading ? ` <small>(${escapeHtml(t.reading)})</small>` : ''}</h3>
        <dl>
          <dt>意味</dt><dd>${escapeHtml(t.definition)}</dd>
          <dt>具体例</dt><dd>${escapeHtml(t.example)}</dd>
          <dt>試験ポイント</dt><dd>${escapeHtml(t.examPoint)}</dd>
          <dt>関連語</dt><dd>${escapeHtml((t.relatedTerms || []).join('、'))}</dd>
        </dl>
      </article>`).join('') || '<p class="muted">該当する用語がありません。</p>';
  }

  function renderHistory() {
    const sessions = [...(state.progress.sessions || [])].slice(-6).reverse();
    if (!sessions.length) {
      els.historyList.innerHTML = '<p class="muted">まだ学習履歴がありません。</p>';
      return;
    }
    els.historyList.innerHTML = sessions.map(s => `
      <div class="history-item">
        <div><strong>${escapeHtml(s.mode)}</strong><br><small class="muted">${new Date(s.finishedAt).toLocaleString('ja-JP')}</small></div>
        <div><strong>${s.correct}/${s.total}</strong> <span class="muted">${s.accuracy}%</span></div>
      </div>`).join('');
  }

  function selectDailyQuestions() {
    const questions = getActiveQuestions();
    const sorted = [...questions].sort((a, b) => priorityScore(b) - priorityScore(a));
    return shuffle(sorted.slice(0, 24)).slice(0, 10);
  }

  function priorityScore(q) {
    const s = state.progress.questionStats[q.id];
    if (!s) return 100;
    let score = 0;
    if (s.attempts === 0) score += 80;
    if (s.wrong) score += s.wrong * 18;
    if (s.uncertain) score += s.uncertain * 15;
    if (!s.mastered) score += 20;
    if (s.streak >= 3) score -= 40;
    return score;
  }

  function selectCategoryQuestions(categoryId, count) {
    const questions = getActiveQuestions().filter(q => q.categoryId === categoryId);
    return takeWithPriority(questions, count);
  }

  function selectMockQuestions(count) {
    const questions = getActiveQuestions();
    return shuffle(questions).slice(0, Math.min(count, questions.length));
  }

  function startWeakQuiz() {
    const weak = getActiveQuestions().filter(q => {
      const s = state.progress.questionStats[q.id];
      return s && s.attempts > 0 && isWeakStat(s);
    });
    if (!weak.length) {
      alert('現在、復習対象の問題はありません。まずは今日の10問または分野別演習を解いてください。');
      return;
    }
    startQuiz('苦手問題復習', takeWithPriority(weak, Math.min(20, weak.length)), 0);
  }

  function takeWithPriority(questions, count) {
    const sorted = [...questions].sort((a, b) => priorityScore(b) - priorityScore(a));
    const front = sorted.slice(0, Math.min(sorted.length, count * 2));
    return shuffle(front).slice(0, Math.min(count, questions.length));
  }


  function buildChoiceOrders(questions) {
    const orders = {};
    questions.forEach(q => {
      orders[q.id] = shuffle([0, 1, 2, 3]);
    });
    return orders;
  }

  function ensureChoiceOrders(session) {
    session.choiceOrders = session.choiceOrders || {};
    (session.questions || []).forEach(id => {
      const q = getQuestionById(id);
      if (!q) return;
      if (!Array.isArray(session.choiceOrders[id]) || session.choiceOrders[id].length !== 4) {
        session.choiceOrders[id] = shuffle([0, 1, 2, 3]);
      }
    });
  }

  function getChoiceOrder(session, question) {
    session.choiceOrders = session.choiceOrders || {};
    if (!Array.isArray(session.choiceOrders[question.id]) || session.choiceOrders[question.id].length !== 4) {
      session.choiceOrders[question.id] = shuffle([0, 1, 2, 3]);
    }
    return session.choiceOrders[question.id];
  }

  function startQuiz(mode, questions, durationSeconds = 0, isMock = false) {
    if (!questions || !questions.length) {
      alert('出題できる問題がありません。');
      return;
    }
    clearCurrentSession();
    state.session = {
      mode,
      isMock,
      durationSeconds,
      questions: questions.map(q => q.id),
      choiceOrders: buildChoiceOrders(questions),
      index: 0,
      answers: [],
      startedAt: new Date().toISOString(),
      answeredCurrent: false,
      finished: false,
    };
    state.timeLeft = durationSeconds;
    showScreen('quizScreen');
    renderQuestion();
    if (durationSeconds) startTimer();
    saveCurrentSession();
  }

  function startTimer() {
    if (state.timerId) clearInterval(state.timerId);
    els.timerDisplay.classList.remove('hidden');
    updateTimerDisplay();
    state.timerId = setInterval(() => {
      state.timeLeft -= 1;
      updateTimerDisplay();
      saveCurrentSession();
      if (state.timeLeft <= 0) {
        clearInterval(state.timerId);
        state.timerId = null;
        finishQuiz(true);
      }
    }, 1000);
  }

  function updateTimerDisplay() {
    const seconds = Math.max(0, state.timeLeft || 0);
    const m = String(Math.floor(seconds / 60)).padStart(2, '0');
    const s = String(seconds % 60).padStart(2, '0');
    els.timerDisplay.textContent = `${m}:${s}`;
  }

  function renderQuestion() {
    const session = state.session;
    if (!session) return;
    const question = getQuestionById(session.questions[session.index]);
    if (!question) return;
    const order = getChoiceOrder(session, question);

    session.answeredCurrent = false;
    els.quizModeLabel.textContent = session.mode;
    els.quizProgress.textContent = `${session.index + 1} / ${session.questions.length}`;
    els.timerDisplay.classList.toggle('hidden', !session.durationSeconds);
    els.questionCategory.textContent = question.categoryName;
    els.questionDifficulty.textContent = question.difficulty;
    els.questionType.textContent = question.type;
    els.questionText.textContent = question.question;
    els.uncertainCheck.checked = false;
    els.answerPanel.className = 'answer-panel hidden';
    els.answerPanel.innerHTML = '';
    els.nextQuestionBtn.classList.add('hidden');

    const displayChoices = order.map((originalIdx, displayIdx) => ({
      displayIndex: displayIdx + 1,
      originalIndex: originalIdx + 1,
      text: question.choices[originalIdx],
    }));

    els.choices.innerHTML = displayChoices.map(item => `
      <button class="choice-btn" data-choice-index="${item.displayIndex}" data-original-index="${item.originalIndex}">
        <span class="choice-index">${item.displayIndex}</span>${escapeHtml(item.text)}
      </button>`).join('');

    els.choices.querySelectorAll('.choice-btn').forEach(btn => {
      btn.addEventListener('click', () => answerQuestion(Number(btn.dataset.choiceIndex)));
    });

    saveCurrentSession();
  }

  function answerQuestion(choiceIndex) {
    const session = state.session;
    if (!session || session.answeredCurrent) return;
    const q = getQuestionById(session.questions[session.index]);
    const order = getChoiceOrder(session, q);
    const selectedOriginal = order[choiceIndex - 1] + 1;
    const correctDisplayIndex = order.indexOf(q.answer - 1) + 1;
    const isCorrect = selectedOriginal === q.answer;
    const uncertain = els.uncertainCheck.checked;
    const now = new Date().toISOString();

    session.answeredCurrent = true;
    session.answers.push({
      questionId: q.id,
      selected: choiceIndex,
      selectedOriginal,
      correctAnswerDisplayed: correctDisplayIndex,
      correctAnswerOriginal: q.answer,
      answerText: q.answerText || q.choices[q.answer - 1],
      displayOrder: order.map(i => i + 1),
      correct: isCorrect,
      uncertain,
      answeredAt: now,
      categoryId: q.categoryId,
      categoryName: q.categoryName,
    });

    const stat = getStat(q.id);
    stat.attempts += 1;
    stat.correct += isCorrect ? 1 : 0;
    stat.wrong += isCorrect ? 0 : 1;
    stat.uncertain += uncertain ? 1 : 0;
    stat.streak = isCorrect && !uncertain ? stat.streak + 1 : 0;
    stat.lastAnswer = selectedOriginal;
    stat.lastAnsweredAt = now;
    stat.mastered = stat.streak >= 3;
    state.progress.lastStudyDate = now.slice(0, 10);
    saveProgress();

    els.choices.querySelectorAll('.choice-btn').forEach(btn => {
      const idx = Number(btn.dataset.choiceIndex);
      btn.disabled = true;
      if (idx === correctDisplayIndex) btn.classList.add('correct');
      if (idx === choiceIndex && !isCorrect) btn.classList.add('wrong');
    });

    renderAnswerPanel(q, choiceIndex, isCorrect, uncertain, order);
    els.nextQuestionBtn.textContent = session.index === session.questions.length - 1 ? '結果を見る' : '次の問題へ';
    els.nextQuestionBtn.classList.remove('hidden');
    saveCurrentSession();
  }

  function renderAnswerPanel(q, selected, isCorrect, uncertain, order) {
    const correctDisplayIndex = order.indexOf(q.answer - 1) + 1;
    const explanations = q.wrongChoiceExplanations || [];
    const wrongDetails = order.map((originalIdx, displayIdx) => {
      const displayNo = displayIdx + 1;
      const mark = originalIdx + 1 === q.answer ? '正解' : '確認';
      const text = explanations[originalIdx] || 'この選択肢が設問の条件に合うか確認しましょう。';
      return `<li>${displayNo}. ${mark}：${escapeHtml(text)}</li>`;
    }).join('');
    els.answerPanel.className = `answer-panel ${isCorrect ? 'correct' : 'wrong'}`;
    els.answerPanel.innerHTML = `
      <h3>${isCorrect ? '正解です' : '不正解です'}${uncertain ? '（復習対象に追加）' : ''}</h3>
      <p><strong>正解：</strong>${correctDisplayIndex}. ${escapeHtml(q.answerText || q.choices[q.answer - 1])}</p>
      <p>${escapeHtml(q.explanation || '')}</p>
      ${q.examPoint ? `<p><strong>試験ポイント：</strong>${escapeHtml(q.examPoint)}</p>` : ''}
      ${q.keywords && q.keywords.length ? `<p><strong>関連キーワード：</strong>${escapeHtml(q.keywords.join('、'))}</p>` : ''}
      ${wrongDetails ? `<details><summary>選択肢ごとの確認</summary><ul>${wrongDetails}</ul></details>` : ''}
    `;
  }

  function goNextQuestion() {
    const session = state.session;
    if (!session) return;
    if (session.index >= session.questions.length - 1) {
      finishQuiz(false);
    } else {
      session.index += 1;
      renderQuestion();
    }
  }

  function finishQuiz(timeUp) {
    const session = state.session;
    if (!session) return;
    session.finished = true;
    if (state.timerId) clearInterval(state.timerId);
    state.timerId = null;

    const answered = session.answers.length;
    const correct = session.answers.filter(a => a.correct).length;
    const total = session.questions.length;
    const accuracy = answered ? Math.round(correct / answered * 100) : 0;
    const result = {
      mode: session.mode,
      total,
      answered,
      correct,
      accuracy,
      timeUp,
      startedAt: session.startedAt,
      finishedAt: new Date().toISOString(),
      answers: session.answers,
    };
    state.progress.sessions = state.progress.sessions || [];
    state.progress.sessions.push(result);
    if (state.progress.sessions.length > 200) state.progress.sessions = state.progress.sessions.slice(-200);
    saveProgress();
    clearCurrentSession();
    renderResult(result);
    showScreen('resultScreen');
  }

  function renderResult(result) {
    const label = getScoreLabel(result.accuracy, result.answered);
    const categoryRows = summarizeResultByCategory(result).map(r => `
      <div class="category-row">
        <div class="category-id">${r.categoryId}</div>
        <div><strong>${escapeHtml(r.categoryName)}</strong><div class="progress-bar"><div class="progress-fill" style="width:${r.accuracy}%"></div></div></div>
        <div class="small-stat">${r.accuracy}%</div>
        <div class="small-stat">${r.correct}/${r.total}</div>
      </div>`).join('');
    const mistakes = result.answers.filter(a => !a.correct || a.uncertain).map(a => {
      const q = getQuestionById(a.questionId);
      const answerText = a.answerText || q.answerText || q.choices[q.answer - 1];
      const answerNo = a.correctAnswerDisplayed ? `${a.correctAnswerDisplayed}. ` : '';
      return `<div class="mistake-item"><strong>${q.id} ${escapeHtml(q.question)}</strong><br><span class="muted">正解：${answerNo}${escapeHtml(answerText)}</span></div>`;
    }).join('');

    els.resultPanel.innerHTML = `
      <p class="muted">${result.timeUp ? '制限時間になりました。' : '演習が完了しました。'}</p>
      <div class="score-big">${result.correct}/${result.answered}問 正解</div>
      <div class="result-grid">
        <div class="result-stat"><span>正答率</span><strong>${result.accuracy}%</strong></div>
        <div class="result-stat"><span>目安</span><strong>${escapeHtml(label.label)}</strong></div>
        <div class="result-stat"><span>出題数</span><strong>${result.total}</strong></div>
        <div class="result-stat"><span>未回答</span><strong>${result.total - result.answered}</strong></div>
      </div>
      <p>${escapeHtml(label.help)}</p>
      <h3>カテゴリ別結果</h3>
      <div class="category-list">${categoryRows || '<p class="muted">集計対象がありません。</p>'}</div>
      <h3 style="margin-top:1rem;">復習対象</h3>
      <div class="mistake-list">${mistakes || '<p class="muted">復習対象はありません。次は模擬試験に進みましょう。</p>'}</div>
      <div class="quiz-actions">
        <button data-action="start-weak" class="secondary">復習対象を解く</button>
        <button data-action="go-home" class="primary">ホームへ戻る</button>
      </div>
    `;
  }

  function summarizeResultByCategory(result) {
    const map = new Map();
    result.answers.forEach(a => {
      if (!map.has(a.categoryId)) map.set(a.categoryId, { categoryId: a.categoryId, categoryName: a.categoryName, total: 0, correct: 0 });
      const row = map.get(a.categoryId);
      row.total += 1;
      row.correct += a.correct ? 1 : 0;
    });
    return [...map.values()].map(r => ({ ...r, accuracy: Math.round(r.correct / r.total * 100) })).sort((a, b) => a.categoryId.localeCompare(b.categoryId));
  }

  function getQuestionById(id) {
    return DATA.questions.find(q => q.id === id);
  }

  function resetProgress() {
    if (!confirm('学習履歴をすべて削除します。よろしいですか？')) return;
    localStorage.removeItem(STORAGE_KEY);
    clearCurrentSession();
    state.progress = loadProgress();
    renderHome();
    renderCategoryScreen();
    renderHistoryScreen();
    if (firebaseState.user) scheduleCloudSave();
    alert('この端末の学習履歴をリセットしました。Google同期中の場合はクラウド側にも空の履歴を保存します。');
  }

  function exportProgress() {
    const payload = {
      app: 'DXビジネス検定 700点突破アプリ',
      appVersion: APP_VERSION,
      exportedAt: new Date().toISOString(),
      progress: state.progress,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dx-biz-progress-v2_0-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function importProgress(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const raw = JSON.parse(String(reader.result || ''));
        const imported = normalizeProgress(raw);
        const importedCount = Object.keys(imported.questionStats || {}).length;
        const importedSessions = (imported.sessions || []).length;
        if (!importedCount && !importedSessions) {
          alert('読み込める学習履歴が見つかりませんでした。');
          return;
        }

        const mode = chooseImportMode(importedCount, importedSessions);
        if (!mode) return;

        if (mode === 'replace') {
          if (!confirm('現在の学習履歴を、読み込んだ履歴で上書きします。よろしいですか？')) return;
          state.progress = imported;
        } else {
          state.progress = mergeProgress(state.progress, imported);
        }

        saveProgress();
        clearCurrentSession();
        renderHome();
        renderCategoryScreen();
        renderTermScreen();
        renderHistoryScreen();
        showScreen('homeScreen');
        alert(mode === 'replace' ? '学習履歴を読み込み、現在の履歴を上書きしました。' : '学習履歴を統合しました。');
      } catch (err) {
        console.error(err);
        alert('JSONファイルの読み込みに失敗しました。書き出した履歴ファイルを選択してください。');
      }
    };
    reader.onerror = () => alert('ファイルを読み込めませんでした。');
    reader.readAsText(file, 'utf-8');
  }

  function chooseImportMode(questionCount, sessionCount) {
    const message = `読み込む履歴：問題別履歴 ${questionCount}件、演習履歴 ${sessionCount}件\n\n「統合」なら現在の履歴に加算します。別PCの履歴を合わせたい場合はこちらです。\n「上書き」なら現在の履歴を削除して、読み込んだ履歴だけにします。\n\n入力してください： merge = 統合 / replace = 上書き`;
    const input = prompt(message, 'merge');
    if (input === null) return null;
    const value = input.trim().toLowerCase();
    if (['merge', 'm', '統合'].includes(value)) return 'merge';
    if (['replace', 'r', '上書き'].includes(value)) return 'replace';
    alert('「merge」または「replace」を入力してください。');
    return null;
  }


  function isFirebaseConfigured() {
    const cfg = window.DX_BIZ_FIREBASE_CONFIG || {};
    return Boolean(cfg.apiKey && cfg.authDomain && cfg.projectId && !String(cfg.apiKey).includes('YOUR_'));
  }

  function initFirebaseSync() {
    if (!isFirebaseConfigured()) {
      firebaseState.status = 'Firebase設定待ち';
      renderAuthPanel();
      return;
    }
    try {
      firebaseState.app = initializeApp(window.DX_BIZ_FIREBASE_CONFIG);
      firebaseState.auth = getAuth(firebaseState.app);
      firebaseState.db = getFirestore(firebaseState.app);
      firebaseState.enabled = true;
      firebaseState.initialized = true;
      firebaseState.status = 'ログイン待ち';
      renderAuthPanel();

      onAuthStateChanged(firebaseState.auth, async (user) => {
        firebaseState.user = user || null;
        firebaseState.status = user ? 'Googleログイン済み' : 'ログアウト中';
        renderAuthPanel();
        if (user) {
          await syncWithCloud({ reason: 'sign-in' });
        }
      });
    } catch (err) {
      console.error(err);
      firebaseState.status = 'Firebase初期化エラー';
      renderAuthPanel(String(err?.message || err));
    }
  }

  async function signInWithGoogle() {
    if (!firebaseState.enabled || !firebaseState.auth) {
      alert('Firebase設定が未設定です。firebase-config.js にFirebase構成値を入れてからWeb上で開いてください。');
      return;
    }
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(firebaseState.auth, provider);
    } catch (err) {
      console.error(err);
      alert(`Googleログインに失敗しました。\n${err?.message || err}`);
    }
  }

  async function signOutFromGoogle() {
    if (!firebaseState.auth) return;
    await signOut(firebaseState.auth);
    firebaseState.user = null;
    firebaseState.status = 'ログアウト中';
    renderAuthPanel();
  }

  function getUserProgressRef() {
    if (!firebaseState.db || !firebaseState.user) return null;
    return doc(firebaseState.db, 'users', firebaseState.user.uid, 'apps', 'dxBizTrainer');
  }

  function scheduleCloudSave() {
    if (!firebaseState.user || !firebaseState.db) return;
    if (cloudSaveTimer) clearTimeout(cloudSaveTimer);
    cloudSaveTimer = setTimeout(() => pushCloudProgress({ silent: true }), 1200);
  }

  async function syncWithCloud({ reason = 'manual-merge' } = {}) {
    const ref = getUserProgressRef();
    if (!ref) {
      renderAuthPanel();
      return;
    }
    try {
      firebaseState.status = '同期中';
      renderAuthPanel();
      const snap = await getDoc(ref);
      const cloudProgress = snap.exists() ? normalizeProgress(snap.data().progress || {}) : createBlankProgress();
      const merged = snap.exists() ? mergeProgress(state.progress, cloudProgress) : normalizeProgress(state.progress);
      state.progress = merged;
      saveProgressLocalOnly();
      await setDoc(ref, {
        progress: state.progress,
        app: 'DXビジネス検定 700点突破アプリ',
        appVersion: APP_VERSION,
        clientUpdatedAt: new Date().toISOString(),
        updatedAt: serverTimestamp(),
        lastSyncReason: reason,
      }, { merge: true });
      firebaseState.lastSyncAt = new Date().toISOString();
      firebaseState.status = '同期済み';
      setSyncErrorDetail('');
      renderHome();
      renderCategoryScreen();
      renderTermScreen();
      renderHistoryScreen();
      renderAuthPanel();
    } catch (err) {
      handleSyncError(err, 'クラウド同期');
    }
  }

  async function pullCloudProgress() {
    const ref = getUserProgressRef();
    if (!ref) { alert('Googleログイン後に利用できます。'); return; }
    if (!confirm('クラウド上の履歴で、この端末の履歴を上書きします。よろしいですか？')) return;
    try {
      firebaseState.status = 'クラウド読込中';
      renderAuthPanel();
      const snap = await getDoc(ref);
      if (!snap.exists()) { alert('クラウド上に学習履歴がありません。'); return; }
      state.progress = normalizeProgress(snap.data().progress || {});
      saveProgressLocalOnly();
      firebaseState.lastSyncAt = new Date().toISOString();
      firebaseState.status = 'クラウドから読込済み';
      setSyncErrorDetail('');
      renderHome();
      renderCategoryScreen();
      renderTermScreen();
      renderHistoryScreen();
      renderAuthPanel();
    } catch (err) {
      handleSyncError(err, 'クラウド履歴の読み込み');
    }
  }

  async function pushCloudProgress(options = {}) {
    const ref = getUserProgressRef();
    if (!ref) { if (!options.silent) alert('Googleログイン後に利用できます。'); return; }
    if (!options.silent && !confirm('この端末の履歴をクラウドへ保存します。クラウド側の同じアプリ履歴は上書きされます。よろしいですか？')) return;
    try {
      await setDoc(ref, {
        progress: normalizeProgress(state.progress),
        app: 'DXビジネス検定 700点突破アプリ',
        appVersion: APP_VERSION,
        clientUpdatedAt: new Date().toISOString(),
        updatedAt: serverTimestamp(),
        lastSyncReason: options.silent ? 'auto-save' : 'manual-push',
      }, { merge: true });
      firebaseState.lastSyncAt = new Date().toISOString();
      firebaseState.status = '同期済み';
      setSyncErrorDetail('');
      renderAuthPanel();
      if (!options.silent) alert('クラウドへ保存しました。');
    } catch (err) {
      handleSyncError(err, 'クラウド保存', { silent: options.silent });
    }
  }

  async function testFirestoreConnection() {
    const ref = getUserProgressRef();
    if (!ref) { alert('Googleログイン後に利用できます。'); return; }
    try {
      firebaseState.status = 'Firestore接続テスト中';
      renderAuthPanel();
      await setDoc(ref, {
        app: 'DXビジネス検定 700点突破アプリ',
        appVersion: APP_VERSION,
        connectionTestAt: new Date().toISOString(),
        updatedAt: serverTimestamp(),
      }, { merge: true });
      const snap = await getDoc(ref);
      if (!snap.exists()) throw new Error('書き込み後の読み込みに失敗しました。');
      firebaseState.status = '接続テスト成功';
      firebaseState.lastSyncAt = new Date().toISOString();
      setSyncErrorDetail('');
      renderAuthPanel();
      alert('Firestoreへの書き込み・読み込みに成功しました。同期設定は正常です。');
    } catch (err) {
      handleSyncError(err, 'Firestore接続テスト');
    }
  }

  function handleSyncError(err, label, options = {}) {
    console.error(err);
    firebaseState.status = '同期エラー';
    const message = buildFirebaseErrorMessage(err, label);
    setSyncErrorDetail(message);
    renderAuthPanel(message);
    if (!options.silent) alert(message);
  }

  function setSyncErrorDetail(message) {
    if (!els.syncErrorDetail) return;
    els.syncErrorDetail.textContent = message || '';
    els.syncErrorDetail.classList.toggle('hidden', !message);
  }

  function buildFirebaseErrorMessage(err, label) {
    const code = err?.code || 'unknown';
    const rawMessage = err?.message || String(err || '不明なエラー');
    const hintMap = {
      'permission-denied': 'Firestore Rulesが未設定、または users/{uid}/apps/dxBizTrainer への読み書きが許可されていない可能性が高いです。',
      'unauthenticated': 'ログイン状態が切れている可能性があります。ログアウト→再ログインしてください。',
      'failed-precondition': 'Firestore Databaseが未作成、またはFirestoreがDatastoreモードになっている可能性があります。Firebase ConsoleでFirestore Databaseを作成してください。',
      'not-found': 'Firestore Databaseまたは対象ドキュメントが見つかりません。Firestore Databaseが作成済みか確認してください。',
      'unavailable': 'ネットワーク、広告ブロッカー、社内プロキシ、Firebase側の一時的な接続問題の可能性があります。',
      'resource-exhausted': 'Firebase/Firestoreの無料枠やクォータに達している可能性があります。',
      'invalid-argument': 'Firestoreへ保存するデータ形式に問題がある可能性があります。',
    };
    const hint = hintMap[code] || 'Firebase設定、Firestore Database、Firestore Rules、公開ドメイン、ネットワークを確認してください。';
    return `${label}に失敗しました。

エラーコード: ${code}
内容: ${rawMessage}

確認ポイント: ${hint}

Firestore Rulesは同梱の FIRESTORE_RULES.txt をそのまま貼り付けて公開してください。`;
  }

  function renderAuthPanel(errorMessage = '') {
    if (!els.authStatus) return;
    const configured = isFirebaseConfigured();
    const user = firebaseState.user;
    els.authStatus.textContent = configured ? firebaseState.status : 'Firebase設定待ち';
    els.authUserName.textContent = user ? (user.displayName || 'Googleユーザー') : '未ログイン';
    els.authUserEmail.textContent = user ? (user.email || '') : (configured ? 'Googleログインすると履歴を同期できます' : 'firebase-config.js に設定値を入れてください');
    if (els.syncStatusBadge) {
      els.syncStatusBadge.textContent = firebaseState.lastSyncAt ? `最終同期 ${new Date(firebaseState.lastSyncAt).toLocaleString('ja-JP')}` : (configured ? '未同期' : 'Firebase未設定');
    }
    els.loginBtn.disabled = !configured || Boolean(user);
    els.logoutBtn.disabled = !user;
    els.syncNowBtn.disabled = !user;
    els.pullCloudBtn.disabled = !user;
    els.pushCloudBtn.disabled = !user;
    if (els.syncTestBtn) els.syncTestBtn.disabled = !user;
    els.authPanel?.classList.toggle('auth-disabled', !configured);
    if (errorMessage) console.warn(errorMessage);
  }

  function renderHistoryScreen() {
    if (!els.historyDetailList) return;
    const sessions = [...(state.progress.sessions || [])].sort((a, b) => String(b.finishedAt || '').localeCompare(String(a.finishedAt || '')));
    if (!sessions.length) {
      els.historyDetailList.innerHTML = '<p class="muted">まだ演習履歴がありません。</p>';
    } else {
      els.historyDetailList.innerHTML = sessions.map(s => `
        <div class="history-item detail-history-item">
          <div>
            <strong>${escapeHtml(s.mode || '演習')}</strong><br>
            <small class="muted">${s.finishedAt ? new Date(s.finishedAt).toLocaleString('ja-JP') : ''}</small>
          </div>
          <div><strong>${s.correct}/${s.answered || s.total}</strong> <span class="muted">${s.accuracy}%</span></div>
          <div class="muted">出題 ${s.total}問 ／ 未回答 ${(s.total || 0) - (s.answered || 0)}</div>
        </div>`).join('');
    }

    const categoryRows = DATA.categories.map(cat => {
      const summary = getCategoryStats(cat.category_id);
      return `
        <div class="category-row">
          <div class="category-id">${cat.category_id}</div>
          <div><strong>${escapeHtml(cat.category_name)}</strong><div class="progress-bar"><div class="progress-fill" style="width:${summary.answeredRatio}%"></div></div></div>
          <div class="small-stat">${summary.accuracy}%</div>
          <div class="small-stat">${summary.answered}/${summary.total}問</div>
        </div>`;
    }).join('');
    els.historyCategoryList.innerHTML = categoryRows;

    const weak = getActiveQuestions()
      .filter(q => { const s = state.progress.questionStats[q.id]; return s && isWeakStat(s); })
      .sort((a, b) => priorityScore(b) - priorityScore(a))
      .slice(0, 30);
    els.historyWeakList.innerHTML = weak.length ? weak.map(q => {
      const s = state.progress.questionStats[q.id];
      const acc = s.attempts ? Math.round((s.correct || 0) / s.attempts * 100) : 0;
      return `<div class="mistake-item"><strong>${q.id} ${escapeHtml(q.question)}</strong><br><span class="muted">${escapeHtml(q.categoryName)} ／ 正答率 ${acc}% ／ 回答 ${s.attempts}回 ／ 迷い ${s.uncertain || 0}回</span></div>`;
    }).join('') : '<p class="muted">現在、復習対象の問題はありません。</p>';
  }

  function mergeProgress(current, imported) {
    const base = normalizeProgress(current);
    const incoming = normalizeProgress(imported);

    const sessionMap = new Map();
    [...(base.sessions || []), ...(incoming.sessions || [])].forEach(session => {
      if (!session || typeof session !== 'object') return;
      const key = `${session.mode || ''}|${session.startedAt || ''}|${session.finishedAt || ''}|${session.total || ''}|${session.correct || ''}`;
      sessionMap.set(key, session);
    });
    const sessions = [...sessionMap.values()]
      .sort((a, b) => String(a.finishedAt || '').localeCompare(String(b.finishedAt || '')))
      .slice(-200);

    const questionStats = rebuildStatsFromSessions(sessions);
    mergeOrphanQuestionStats(questionStats, base.questionStats);
    mergeOrphanQuestionStats(questionStats, incoming.questionStats);

    return {
      questionStats,
      sessions,
      terms: { ...(base.terms || {}), ...(incoming.terms || {}) },
      lastStudyDate: [base.lastStudyDate, incoming.lastStudyDate].filter(Boolean).sort().pop() || null,
      updatedAt: [base.updatedAt, incoming.updatedAt].filter(Boolean).sort().pop() || null,
    };
  }

  function rebuildStatsFromSessions(sessions) {
    const stats = {};
    [...(sessions || [])]
      .sort((a, b) => String(a.finishedAt || '').localeCompare(String(b.finishedAt || '')))
      .forEach(session => {
        (session.answers || []).forEach(answer => {
          const id = answer.questionId;
          if (!id) return;
          if (!stats[id]) stats[id] = { attempts: 0, correct: 0, wrong: 0, uncertain: 0, streak: 0, lastAnswer: null, lastAnsweredAt: null, mastered: false };
          const s = stats[id];
          const ok = Boolean(answer.correct);
          const uncertain = Boolean(answer.uncertain);
          s.attempts += 1;
          s.correct += ok ? 1 : 0;
          s.wrong += ok ? 0 : 1;
          s.uncertain += uncertain ? 1 : 0;
          s.streak = ok && !uncertain ? s.streak + 1 : 0;
          s.lastAnswer = answer.selectedOriginal ?? answer.selected ?? s.lastAnswer;
          s.lastAnsweredAt = answer.answeredAt || session.finishedAt || s.lastAnsweredAt;
          s.mastered = s.streak >= 3;
        });
      });
    return stats;
  }

  function mergeOrphanQuestionStats(target, source) {
    Object.entries(source || {}).forEach(([questionId, stat]) => {
      if (!stat || typeof stat !== 'object') return;
      if (!target[questionId]) {
        target[questionId] = { ...stat };
        return;
      }
      const current = target[questionId];
      if ((stat.attempts || 0) > (current.attempts || 0) && !hasSessionAnswerForQuestion(questionId)) {
        target[questionId] = { ...stat };
        return;
      }
      if (stat.lastAnsweredAt && (!current.lastAnsweredAt || stat.lastAnsweredAt > current.lastAnsweredAt)) {
        current.lastAnswer = stat.lastAnswer ?? current.lastAnswer;
        current.lastAnsweredAt = stat.lastAnsweredAt;
      }
      current.mastered = Boolean(current.mastered || stat.mastered);
    });
  }

  function hasSessionAnswerForQuestion(questionId) {
    return (state.progress.sessions || []).some(session => (session.answers || []).some(a => a.questionId === questionId));
  }

  function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function escapeHtml(str) {
    return String(str ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }
})();
