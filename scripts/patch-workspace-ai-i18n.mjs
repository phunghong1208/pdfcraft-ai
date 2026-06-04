#!/usr/bin/env node
/** Patch workspace fragments with full aiPanel + tools.open translations. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const fragmentsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'messages', 'fragments');

const AI_PANEL = {
  vi: {
    open: 'Mở',
    aiPanel: {
      newBadge: 'Mới',
      indexing: 'Đang lập chỉ mục tài liệu cho chat AI...',
      summarizing: 'Đang tóm tắt (có thể mất 1–2 phút, đừng đóng tab)...',
      indexError: 'Không thể chuẩn bị tài liệu cho chat.',
      runSummaryForChat:
        'Chat cần chạy Tóm tắt trước (khoảng 1–2 phút). Mở tab Tóm tắt, tạo tóm tắt, rồi quay lại Chat.',
      goToSummaryTab: 'Mở tab Tóm tắt',
      chatReadonlyPlaceholder: 'Chạy Tóm tắt trước để hỏi về tài liệu…',
      startSummaryForChat: 'Tóm tắt để bật chat',
      chatReady: 'Đã sẵn sàng chat — hãy nhập câu hỏi.',
      summaryMissingDocumentId:
        'Tóm tắt xong nhưng server không trả document_id — không thể chat.',
      chatReindexing: 'Đang đồng bộ tài liệu cho chat (chạy lại tóm tắt)…',
      chatNoContext: 'Chat không tìm thấy tài liệu trong kho dữ liệu.',
      chatNoContextHint:
        'Bấm lại «Tạo tóm tắt» ở tab Tóm tắt, đợi xong rồi hỏi lại.',
      chatError: 'Yêu cầu chat thất bại.',
      summaryError: 'Yêu cầu tóm tắt thất bại.',
      noFile: 'Hãy tải PDF trước.',
      noDocumentId: 'Tài liệu chưa được lập chỉ mục. Đợi hoặc chạy Tóm tắt trước.',
      answerLanguage: {
        label: 'Ngôn ngữ trả lời',
        hint: 'Tóm tắt và chat sẽ trả lời bằng ngôn ngữ này.',
      },
      languageShort: 'Ngôn ngữ',
      analyzing: '✨ AI đang phân tích tài liệu…',
      thinkingAi: '✨ AI đang suy nghĩ…',
      summaryByAi: '✨ Tóm tắt bởi AI',
      askDocument: '✨ Hỏi tài liệu',
      copy: 'Sao chép',
      copied: 'Đã sao chép',
      copyFailed: 'Không sao chép được.',
      exportPdf: 'Xuất PDF',
      exportFailed: 'Xuất PDF thất bại.',
      summaryDetail: {
        label: 'Độ chi tiết',
        light: { title: 'Ngắn' },
        balanced: { title: 'Vừa' },
        deep: { title: 'Chi tiết' },
      },
      chatContext: {
        label: 'Độ sâu chat',
        light: { title: 'Gọn' },
        balanced: { title: 'Vừa' },
        deep: { title: 'Sâu' },
      },
      generateSummary: 'Tạo tóm tắt',
      summaryPlaceholder: 'Chạy tóm tắt để xem nội dung chính do AI tạo cho PDF này.',
      summaryDone: 'Đã tóm tắt xong. Mở tab Tóm tắt để đọc.',
      documentId: 'Mã tài liệu (chat): {id}',
      previewPdf: 'Xem PDF',
      translateComingSoon: 'Dịch tài liệu — sắp ra mắt.',
      voice: {
        subtitle: 'Nghe nội dung tài liệu bằng giọng nói trên trình duyệt',
        play: 'Bắt đầu đọc',
        pause: 'Tạm dừng',
        resume: 'Tiếp tục',
        stop: 'Dừng',
        speed: 'Tốc độ',
        statusIdle: 'Sẵn sàng phát',
        statusPlaying: 'Đang đọc…',
        statusPaused: 'Đã tạm dừng',
        nowReading: 'Đang phát: {name}',
        voiceLabel: 'Chọn giọng đọc',
        voiceLoading: 'Đang tải danh sách giọng…',
        genderFemale: 'Nữ',
        genderMale: 'Nam',
        genderNeutral: 'Khác',
        noVoicesHint:
          'Trình duyệt chưa có giọng tiếng Việt. Trên macOS: Cài đặt hệ thống → Trợ năng → Nội dung nói → Giọng nói.',
        prepareTitle: 'Tài liệu chưa sẵn sàng để đọc',
        prepareHint: 'Cần xử lý PDF một lần (giống bước kích hoạt chat) — khoảng 1–2 phút.',
        prepareButton: 'Xử lý tài liệu',
        unsupported: 'Trình duyệt không hỗ trợ đọc giọng nói.',
      },
    },
  },
  zh: {
    open: '打开',
    aiPanel: {
      newBadge: '新',
      indexing: '正在为 AI 对话建立文档索引...',
      summarizing: '正在摘要（可能需要 1–2 分钟，请保持此标签页打开）...',
      indexError: '无法为对话准备文档。',
      runSummaryForChat:
        '对话需先运行摘要（约 1–2 分钟）。打开「摘要」标签，生成摘要后返回「对话」。',
      goToSummaryTab: '打开摘要标签',
      chatReadonlyPlaceholder: '请先运行摘要，再询问此文档…',
      startSummaryForChat: '摘要以启用对话',
      chatReady: '对话已就绪 — 请输入问题。',
      summaryMissingDocumentId: '摘要完成但服务器未返回 document_id — 无法对话。',
      chatReindexing: '正在同步文档以进行对话（重新运行摘要）…',
      chatNoContext: '对话在索引中找不到此文档。',
      chatNoContextHint: '在摘要标签再次点击「生成摘要」，等待完成后提问。',
      chatError: '对话请求失败。',
      summaryError: '摘要请求失败。',
      noFile: '请先上传 PDF。',
      noDocumentId: '文档尚未建立索引。请等待或先运行摘要。',
      answerLanguage: {
        label: '回答语言',
        hint: '摘要和对话回复将使用此语言。',
      },
      languageShort: '语言',
      analyzing: '✨ AI 正在分析您的文档…',
      thinkingAi: '✨ AI 正在思考…',
      summaryByAi: '✨ AI 摘要',
      askDocument: '✨ 询问文档',
      copy: '复制',
      copied: '已复制',
      copyFailed: '无法复制到剪贴板。',
      exportPdf: '导出 PDF',
      exportFailed: 'PDF 导出失败。',
      summaryDetail: {
        label: '详细程度',
        light: { title: '简短' },
        balanced: { title: '中等' },
        deep: { title: '详细' },
      },
      chatContext: {
        label: '对话深度',
        light: { title: '浅' },
        balanced: { title: '中' },
        deep: { title: '深' },
      },
      generateSummary: '生成摘要',
      summaryPlaceholder: '运行摘要以查看 AI 为此 PDF 生成的要点。',
      summaryDone: '摘要已就绪。打开摘要标签阅读。',
      documentId: '文档 ID：{id}',
      previewPdf: 'PDF 预览',
      translateComingSoon: '文档翻译 — 即将推出。',
      voice: {
        subtitle: '使用浏览器语音朗读文档内容',
        play: '开始朗读',
        pause: '暂停',
        resume: '继续',
        stop: '停止',
        speed: '语速',
        statusIdle: '准备播放',
        statusPlaying: '正在朗读…',
        statusPaused: '已暂停',
        nowReading: '正在播放：{name}',
        voiceLabel: '语音',
        voiceLoading: '正在加载语音…',
        genderFemale: '女声',
        genderMale: '男声',
        genderNeutral: '其他',
        noVoicesHint: '浏览器没有此语言的语音。macOS：系统设置 → 辅助功能 → 朗读内容。',
        prepareTitle: '文档尚未准备好朗读',
        prepareHint: '需先处理 PDF 一次（与启用对话相同）— 约 1–2 分钟。',
        prepareButton: '处理文档',
        unsupported: '此浏览器不支持语音合成。',
      },
    },
  },
  'zh-TW': {
    open: '開啟',
    aiPanel: {
      answerLanguage: { label: '回答語言', hint: '摘要與對話回覆將使用此語言。' },
      generateSummary: '產生摘要',
      summaryByAi: '✨ AI 摘要',
      askDocument: '✨ 詢問文件',
      summaryDetail: {
        label: '詳細程度',
        light: { title: '簡短' },
        balanced: { title: '中等' },
        deep: { title: '詳細' },
      },
      summaryPlaceholder: '執行摘要以查看 AI 為此 PDF 產生的重點。',
      runSummaryForChat:
        '對話需先執行摘要（約 1–2 分鐘）。開啟「摘要」分頁，產生摘要後返回「對話」。',
      goToSummaryTab: '開啟摘要分頁',
      chatReadonlyPlaceholder: '請先執行摘要，再詢問此文件…',
      voice: {
        speed: '語速',
        statusIdle: '準備播放',
        stop: '停止',
        play: '開始朗讀',
        pause: '暫停',
        resume: '繼續',
      },
    },
  },
  ja: {
    open: '開く',
    aiPanel: {
      answerLanguage: { label: '回答言語', hint: '要約とチャットの返答はこの言語で行われます。' },
      generateSummary: '要約を生成',
      summaryByAi: '✨ AI による要約',
      askDocument: '✨ ドキュメントに質問',
      summaryDetail: {
        label: '詳細レベル',
        light: { title: '短い' },
        balanced: { title: '標準' },
        deep: { title: '詳細' },
      },
      summaryPlaceholder: '要約を実行して、この PDF の AI ハイライトを表示します。',
      runSummaryForChat:
        'チャットには先に要約が必要です（約1〜2分）。「要約」タブで要約を生成し、「チャット」に戻ってください。',
      goToSummaryTab: '要約タブを開く',
      chatReadonlyPlaceholder: 'このドキュメントについて質問するには、先に要約を実行してください…',
      voice: {
        speed: '速度',
        statusIdle: '再生準備完了',
        stop: '停止',
        play: '読み上げ開始',
        pause: '一時停止',
        resume: '再開',
      },
    },
  },
  ko: {
    open: '열기',
    aiPanel: {
      answerLanguage: { label: '답변 언어', hint: '요약과 채팅 답변이 이 언어로 제공됩니다.' },
      generateSummary: '요약 생성',
      summaryByAi: '✨ AI 요약',
      askDocument: '✨ 문서에게 질문',
      summaryDetail: {
        label: '상세 수준',
        light: { title: '짧게' },
        balanced: { title: '보통' },
        deep: { title: '자세히' },
      },
      summaryPlaceholder: '요약을 실행하여 이 PDF의 AI 하이라이트를 확인하세요.',
      runSummaryForChat:
        '채팅을 사용하려면 먼저 요약이 필요합니다(약 1–2분). 요약 탭에서 요약을 생성한 후 채팅으로 돌아가세요.',
      goToSummaryTab: '요약 탭 열기',
      chatReadonlyPlaceholder: '이 문서에 대해 질문하려면 먼저 요약을 실행하세요…',
      voice: {
        speed: '속도',
        statusIdle: '재생 준비됨',
        stop: '중지',
        play: '읽기 시작',
        pause: '일시 정지',
        resume: '계속',
      },
    },
  },
  es: {
    open: 'Abrir',
    aiPanel: {
      answerLanguage: { label: 'Idioma de respuesta', hint: 'El resumen y el chat responderán en este idioma.' },
      generateSummary: 'Generar resumen',
      summaryByAi: '✨ Resumen por IA',
      askDocument: '✨ Pregunta a tu documento',
      summaryDetail: {
        label: 'Nivel de detalle',
        light: { title: 'Corto' },
        balanced: { title: 'Medio' },
        deep: { title: 'Detallado' },
      },
      summaryPlaceholder: 'Ejecuta el resumen para ver los puntos clave generados por IA.',
      runSummaryForChat:
        'El chat requiere un resumen primero (1–2 min). Abre la pestaña Resumen, genera el resumen y vuelve al Chat.',
      goToSummaryTab: 'Abrir pestaña Resumen',
      chatReadonlyPlaceholder: 'Ejecuta el resumen primero para preguntar sobre este documento…',
      voice: { speed: 'Velocidad', statusIdle: 'Listo para reproducir', stop: 'Detener', play: 'Iniciar lectura', pause: 'Pausar', resume: 'Reanudar' },
    },
  },
  fr: {
    open: 'Ouvrir',
    aiPanel: {
      answerLanguage: { label: 'Langue de réponse', hint: 'Le résumé et le chat répondront dans cette langue.' },
      generateSummary: 'Générer le résumé',
      summaryByAi: '✨ Résumé par IA',
      askDocument: '✨ Interroger le document',
      summaryDetail: {
        label: 'Niveau de détail',
        light: { title: 'Court' },
        balanced: { title: 'Moyen' },
        deep: { title: 'Détaillé' },
      },
      summaryPlaceholder: 'Lancez le résumé pour voir les points clés générés par l’IA.',
      runSummaryForChat:
        'Le chat nécessite d’abord un résumé (1–2 min). Ouvrez l’onglet Résumé, générez-le, puis revenez au Chat.',
      goToSummaryTab: 'Ouvrir l’onglet Résumé',
      chatReadonlyPlaceholder: 'Lancez d’abord le résumé pour poser des questions sur ce document…',
      voice: { speed: 'Vitesse', statusIdle: 'Prêt à lire', stop: 'Arrêter', play: 'Commencer la lecture', pause: 'Pause', resume: 'Reprendre' },
    },
  },
  de: {
    open: 'Öffnen',
    aiPanel: {
      answerLanguage: { label: 'Antwortsprache', hint: 'Zusammenfassung und Chat antworten in dieser Sprache.' },
      generateSummary: 'Zusammenfassung erstellen',
      summaryByAi: '✨ Zusammenfassung durch KI',
      askDocument: '✨ Dokument fragen',
      summaryDetail: {
        label: 'Detailgrad',
        light: { title: 'Kurz' },
        balanced: { title: 'Mittel' },
        deep: { title: 'Ausführlich' },
      },
      summaryPlaceholder: 'Zusammenfassung ausführen, um KI-Highlights für dieses PDF zu sehen.',
      runSummaryForChat:
        'Chat erfordert zuerst eine Zusammenfassung (1–2 Min.). Öffnen Sie den Tab Zusammenfassung, erstellen Sie sie und kehren Sie zum Chat zurück.',
      goToSummaryTab: 'Tab Zusammenfassung öffnen',
      chatReadonlyPlaceholder: 'Führen Sie zuerst die Zusammenfassung aus, um Fragen zu stellen…',
      voice: { speed: 'Geschwindigkeit', statusIdle: 'Bereit zur Wiedergabe', stop: 'Stopp', play: 'Lesen starten', pause: 'Pause', resume: 'Fortsetzen' },
    },
  },
  pt: {
    open: 'Abrir',
    aiPanel: {
      answerLanguage: { label: 'Idioma da resposta', hint: 'O resumo e o chat responderão neste idioma.' },
      generateSummary: 'Gerar resumo',
      summaryByAi: '✨ Resumo por IA',
      askDocument: '✨ Pergunte ao documento',
      summaryDetail: {
        label: 'Nível de detalhe',
        light: { title: 'Curto' },
        balanced: { title: 'Médio' },
        deep: { title: 'Detalhado' },
      },
      summaryPlaceholder: 'Execute o resumo para ver destaques gerados pela IA.',
      runSummaryForChat:
        'O chat requer resumo primeiro (1–2 min). Abra a aba Resumo, gere o resumo e volte ao Chat.',
      goToSummaryTab: 'Abrir aba Resumo',
      chatReadonlyPlaceholder: 'Execute o resumo primeiro para perguntar sobre este documento…',
      voice: { speed: 'Velocidade', statusIdle: 'Pronto para reproduzir', stop: 'Parar', play: 'Iniciar leitura', pause: 'Pausar', resume: 'Retomar' },
    },
  },
  it: {
    open: 'Apri',
    aiPanel: {
      answerLanguage: { label: 'Lingua della risposta', hint: 'Riepilogo e chat risponderanno in questa lingua.' },
      generateSummary: 'Genera riepilogo',
      summaryByAi: '✨ Riepilogo IA',
      askDocument: '✨ Chiedi al documento',
      summaryDetail: {
        label: 'Livello di dettaglio',
        light: { title: 'Breve' },
        balanced: { title: 'Medio' },
        deep: { title: 'Dettagliato' },
      },
      summaryPlaceholder: 'Esegui il riepilogo per vedere i punti chiave generati dall’IA.',
      runSummaryForChat:
        'La chat richiede prima un riepilogo (1–2 min). Apri la scheda Riepilogo, generalo e torna alla Chat.',
      goToSummaryTab: 'Apri scheda Riepilogo',
      chatReadonlyPlaceholder: 'Esegui prima il riepilogo per chiedere informazioni su questo documento…',
      voice: { speed: 'Velocità', statusIdle: 'Pronto per la riproduzione', stop: 'Stop', play: 'Avvia lettura', pause: 'Pausa', resume: 'Riprendi' },
    },
  },
  id: {
    open: 'Buka',
    aiPanel: {
      answerLanguage: { label: 'Bahasa jawaban', hint: 'Ringkasan dan chat akan menjawab dalam bahasa ini.' },
      generateSummary: 'Buat ringkasan',
      summaryByAi: '✨ Ringkasan oleh AI',
      askDocument: '✨ Tanya dokumen',
      summaryDetail: {
        label: 'Tingkat detail',
        light: { title: 'Singkat' },
        balanced: { title: 'Sedang' },
        deep: { title: 'Detail' },
      },
      summaryPlaceholder: 'Jalankan ringkasan untuk melihat sorotan AI untuk PDF ini.',
      runSummaryForChat:
        'Chat memerlukan Ringkasan terlebih dahulu (1–2 menit). Buka tab Ringkasan, buat ringkasan, lalu kembali ke Chat.',
      goToSummaryTab: 'Buka tab Ringkasan',
      chatReadonlyPlaceholder: 'Jalankan Ringkasan dulu untuk bertanya tentang dokumen ini…',
      voice: { speed: 'Kecepatan', statusIdle: 'Siap diputar', stop: 'Berhenti', play: 'Mulai baca', pause: 'Jeda', resume: 'Lanjutkan' },
    },
  },
  ro: {
    open: 'Deschide',
    aiPanel: {
      answerLanguage: { label: 'Limba răspunsului', hint: 'Rezumatul și chatul vor răspunde în această limbă.' },
      generateSummary: 'Generează rezumat',
      summaryByAi: '✨ Rezumat de AI',
      askDocument: '✨ Întreabă documentul',
      summaryDetail: {
        label: 'Nivel de detaliu',
        light: { title: 'Scurt' },
        balanced: { title: 'Mediu' },
        deep: { title: 'Detaliat' },
      },
      summaryPlaceholder: 'Rulează rezumatul pentru a vedea punctele cheie generate de AI.',
      runSummaryForChat:
        'Chatul necesită mai întâi un rezumat (1–2 min). Deschide fila Rezumat, generează-l, apoi revino la Chat.',
      goToSummaryTab: 'Deschide fila Rezumat',
      chatReadonlyPlaceholder: 'Rulează mai întâi rezumatul pentru a întreba despre acest document…',
      voice: { speed: 'Viteză', statusIdle: 'Gata de redare', stop: 'Oprește', play: 'Începe citirea', pause: 'Pauză', resume: 'Continuă' },
    },
  },
  ar: {
    open: 'فتح',
    aiPanel: {
      answerLanguage: { label: 'لغة الإجابة', hint: 'سيكون الملخص والدردشة بهذه اللغة.' },
      generateSummary: 'إنشاء ملخص',
      summaryByAi: '✨ ملخص بالذكاء الاصطناعي',
      askDocument: '✨ اسأل المستند',
      summaryDetail: {
        label: 'مستوى التفصيل',
        light: { title: 'قصير' },
        balanced: { title: 'متوسط' },
        deep: { title: 'مفصل' },
      },
      summaryPlaceholder: 'شغّل الملخص لرؤية النقاط الرئيسية التي أنشأها الذكاء الاصطناعي.',
      runSummaryForChat:
        'يتطلب الدردشة ملخصًا أولاً (1–2 دقيقة). افتح تبويب الملخص، أنشئه، ثم عد إلى الدردشة.',
      goToSummaryTab: 'فتح تبويب الملخص',
      chatReadonlyPlaceholder: 'شغّل الملخص أولاً لطرح أسئلة حول هذا المستند…',
      voice: { speed: 'السرعة', statusIdle: 'جاهز للتشغيل', stop: 'إيقاف', play: 'بدء القراءة', pause: 'إيقاف مؤقت', resume: 'استئناف' },
    },
  },
};

const HOME_ACTIONS = {
  vi: { scanToPdf: 'Quét sang PDF', split: 'Tách', protect: 'Bảo vệ', ocrText: 'OCR văn bản' },
  zh: { scanToPdf: '扫描为 PDF', split: '拆分', protect: '保护', ocrText: 'OCR 文字' },
  'zh-TW': { scanToPdf: '掃描為 PDF', split: '拆分', protect: '保護', ocrText: 'OCR 文字' },
  ja: { scanToPdf: 'スキャンしてPDF', split: '分割', protect: '保護', ocrText: 'OCRテキスト' },
  ko: { scanToPdf: '스캔 PDF', split: '분할', protect: '보호', ocrText: 'OCR 텍스트' },
  es: { scanToPdf: 'Escanear a PDF', split: 'Dividir', protect: 'Proteger', ocrText: 'OCR texto' },
  fr: { scanToPdf: 'Numériser en PDF', split: 'Diviser', protect: 'Protéger', ocrText: 'OCR texte' },
  de: { scanToPdf: 'Als PDF scannen', split: 'Teilen', protect: 'Schützen', ocrText: 'OCR-Text' },
  pt: { scanToPdf: 'Digitalizar para PDF', split: 'Dividir', protect: 'Proteger', ocrText: 'OCR texto' },
  it: { scanToPdf: 'Scansiona in PDF', split: 'Dividi', protect: 'Proteggi', ocrText: 'OCR testo' },
  id: { scanToPdf: 'Pindai ke PDF', split: 'Pisah', protect: 'Lindungi', ocrText: 'OCR teks' },
  ro: { scanToPdf: 'Scanează în PDF', split: 'Împarte', protect: 'Protejează', ocrText: 'OCR text' },
  ar: { scanToPdf: 'مسح إلى PDF', split: 'تقسيم', protect: 'حماية', ocrText: 'OCR نص' },
};

const FOOTER_TRUST = {
  zh: {
    brandName: 'PDF Reader 工作区',
    tagline: '私密 AI 工作区',
    trustLocalFirst: '本地优先',
    trustNoCloud: '不上传云端',
    trustGdpr: '符合 GDPR',
    trustGroupSecurity: '安全',
    trustGroupDownload: '下载应用',
    downloadApp: '下载应用',
    legalNav: '法律信息',
    terms: '服务条款',
    privacyLink: '隐私政策',
    cookies: 'Cookie',
    copyright: '© {year} PDFCraft. 保留所有权利。',
  },
  vi: {
    tagline: 'Không gian AI riêng tư',
    trustLocalFirst: 'Xử lý cục bộ',
    trustNoCloud: 'Không tải lên đám mây',
    trustGdpr: 'Tuân thủ GDPR',
  },
};

function deepMerge(base, patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return patch ?? base;
  const out = { ...(base && typeof base === 'object' ? base : {}) };
  for (const [k, v] of Object.entries(patch)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      out[k] = deepMerge(out[k], v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

for (const [locale, patch] of Object.entries(AI_PANEL)) {
  const wsPath = path.join(fragmentsDir, `workspace.${locale}.json`);
  if (!fs.existsSync(wsPath)) continue;
  const data = JSON.parse(fs.readFileSync(wsPath, 'utf8'));
  if (patch.open) data.tools = { ...(data.tools ?? {}), open: patch.open };
  if (patch.aiPanel) {
    data.aiPanel = deepMerge(data.aiPanel ?? {}, patch.aiPanel);
  }
  fs.writeFileSync(wsPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  console.log(`workspace.${locale}.json patched`);
}

for (const [locale, actions] of Object.entries(HOME_ACTIONS)) {
  const layoutPath = path.join(fragmentsDir, `layout.${locale}.json`);
  if (!fs.existsSync(layoutPath)) continue;
  const data = JSON.parse(fs.readFileSync(layoutPath, 'utf8'));
  data.homePage.actions = { ...(data.homePage?.actions ?? {}), ...actions };
  if (FOOTER_TRUST[locale]) {
    data.footer = { ...(data.footer ?? {}), ...FOOTER_TRUST[locale] };
  }
  fs.writeFileSync(layoutPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  console.log(`layout.${locale}.json patched`);
}

console.log('Done patching workspace AI i18n.');
