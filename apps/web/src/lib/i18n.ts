import type { AppLanguage, PracticeType, UserRole, VenueType } from '../types/stagera'

export interface Translations {
  app: {
    step1: string
    step2: string
    step3: string
    reportPlaceholderTitle: string
    reportPlaceholderDesc: string
  }
  welcome: {
    title: string
    subtitle: string
    feature1Title: string
    feature1Desc: string
    feature2Title: string
    feature2Desc: string
    feature3Title: string
    feature3Desc: string
    getStarted: string
    alreadyHaveAccount: string
    footerNote: string
  }
  auth: {
    back: string
    signupTab: string
    loginTab: string
    signupHeading: string
    loginHeading: string
    signupSubtitle: string
    loginSubtitle: string
    demoBannerTitle: string
    demoBannerDesc: string
    continueWithGoogle: string
    orEmail: string
    fullNameLabel: string
    fullNamePlaceholder: string
    emailLabel: string
    emailPlaceholder: string
    passwordLabel: string
    passwordPlaceholder: string
    showPassword: string
    hidePassword: string
    createAccountCta: string
    loginCta: string
    submitting: string
    switchToLoginPrompt: string
    switchToLoginLink: string
    switchToSignupPrompt: string
    switchToSignupLink: string
    errEmailRequired: string
    errPasswordShort: string
    errNameRequired: string
    errGeneric: string
  }
  profile: {
    stepLabel: string
    heading: string
    subtitle: string
    languageLabel: string
    roleLabel: string
    roles: Record<UserRole, { label: string; desc: string }>
    fieldLabel: string
    fieldOptional: string
    fieldPlaceholder: string
    goalsLabel: string
    goalsHint: string
    difficultiesLabel: string
    difficultiesHint: string
    saveContinue: string
    saving: string
    goalOptions: { id: string; label: string }[]
    difficultyOptions: { id: string; label: string }[]
  }
  home: {
    greetingMorning: string
    greetingAfternoon: string
    greetingEvening: string
    subtitle: string
    newSession: string
    weeklyTitle: string
    weeklySessions: string
    weeklyMinutes: string
    weeklyAvgWpm: string
    savedSetupsTitle: string
    savedSetupsCount: string
    launchVr: string
    coachedTag: string
    minUnit: string
    lastSessionTitle: string
    viewReport: string
    metricWpm: string
    metricFillers: string
    metricEyeContact: string
    metricTopics: string
    noSessionsYet: string
    quickLaunchTitle: string
    quickLaunchVenue: string
    quickLaunchStart: string
    quickLaunchCancel: string
    navHome: string
    navHistory: string
    navProgress: string
    navSettings: string
    historyTitle: string
    historySubtitle: string
    progressTitle: string
    progressSubtitle: string
    progressTargetLabel: string
    progressWpmRange: string
    settingsTitle: string
    settingsAccount: string
    settingsEditProfile: string
    settingsLanguage: string
    settingsCaptions: string
    settingsCaptionsDesc: string
    settingsKeepRecordings: string
    settingsKeepRecordingsDesc: string
    settingsAutoDelete: string
    settingsAutoDeleteDesc: string
    settingsDemoBadge: string
    settingsSignOut: string
    venues: Record<VenueType, string>
    practiceTypes: Record<PracticeType, string>
  }
  wizard: {
    stepOfTotal: string
    back: string
    continue: string
    extracting: string
    practiceType: {
      heading: string
      subtitle: string
      cards: Record<
        PracticeType,
        {
          title: string
          desc: string
          venueHint: string
        }
      >
    }
    material: {
      heading: string
      subtitle: string
      dropzoneTitle: string
      dropzoneSubtitle: string
      dropzoneLimit: string
      browseBtn: string
      uploadedFilesLabel: string
      removeFile: string
      outlineLabel: string
      outlineOptional: string
      outlinePlaceholder: string
      skipNoSlides: string
      errFileSize: string
      errFileType: string
    }
    interview: {
      heading: string
      subtitle: string
      jobTitleLabel: string
      jobTitlePlaceholder: string
      jdLabel: string
      jdPlaceholder: string
      projectLabel: string
      projectPlaceholder: string
      cvLabel: string
      cvOptional: string
      cvDropzoneTitle: string
      cvDropzoneLimit: string
      cvErrType: string
      cvErrSize: string
      removeCv: string
      previewHeading: string
      previewHint: string
    }
    topics: {
      headingPresentation: string
      headingInterview: string
      subtitlePresentation: string
      subtitleInterview: string
      slideLabel: string
      briefToggle: string
      briefActiveLabel: string
      moveUp: string
      moveDown: string
      deleteTopic: string
      editTopicLabel: string
      addPlaceholder: string
      addBtn: string
      reextractBtn: string
      emptyNotice: string
      sessionTitleLabel: string
      sessionTitlePlaceholder: string
      saveAndLaunchVr: string
      saveToSetups: string
    }
  }
}

export const translations: Record<AppLanguage, Translations> = {
  en: {
    app: {
      step1: 'Step 1: Companion',
      step2: 'Step 2: VR Stage',
      step3: 'Step 3: Report',
      reportPlaceholderTitle: 'Session Report (Step 3)',
      reportPlaceholderDesc:
        'Full WPM timeline, filler word breakdown, eye-contact zones, and flagged moments replay will appear here.',
    },
    welcome: {
      title: 'Rehearse with confidence before you take the stage.',
      subtitle:
        'Prepare your session on your phone, step into a lifelike Meta Quest 3 venue, and get instant AI coaching on pace, clarity, and Q&A.',
      feature1Title: '1. Prepare on your phone',
      feature1Desc: 'Upload slides or job notes, pick your venue, and set your pacing goals in under 3 minutes.',
      feature2Title: '2. Practice in WebXR',
      feature2Desc: 'Present to 1–200 reactive avatars with voice-controlled slides and live AI follow-up questions.',
      feature3Title: '3. Review & improve',
      feature3Desc: 'Track WPM, filler words, eye-contact zones, and retry flagged moments until they click.',
      getStarted: 'Get started',
      alreadyHaveAccount: 'I already have an account',
      footerNote: 'Private by default · English & Français · Built for Meta Quest 3',
    },
    auth: {
      back: 'Back',
      signupTab: 'Create account',
      loginTab: 'Log in',
      signupHeading: 'Create your Stagera account',
      loginHeading: 'Welcome back',
      signupSubtitle: 'Save your rehearsal setups, VR preferences, and progress across devices.',
      loginSubtitle: 'Sign in to access your saved setups and past practice sessions.',
      demoBannerTitle: 'Local demo mode active',
      demoBannerDesc:
        'Supabase keys are not configured in .env.local yet. You can sign up, log in, or use Google sign-in locally to test the full flow.',
      continueWithGoogle: 'Continue with Google',
      orEmail: 'or continue with email',
      fullNameLabel: 'Full name',
      fullNamePlaceholder: 'Alex Rivera',
      emailLabel: 'Email address',
      emailPlaceholder: 'alex@university.edu',
      passwordLabel: 'Password',
      passwordPlaceholder: 'At least 6 characters',
      showPassword: 'Show',
      hidePassword: 'Hide',
      createAccountCta: 'Create account',
      loginCta: 'Log in',
      submitting: 'Please wait…',
      switchToLoginPrompt: 'Already have an account?',
      switchToLoginLink: 'Log in',
      switchToSignupPrompt: 'New to Stagera?',
      switchToSignupLink: 'Create an account',
      errEmailRequired: 'Please enter a valid email address.',
      errPasswordShort: 'Password must be at least 6 characters.',
      errNameRequired: 'Please enter your full name.',
      errGeneric: 'Authentication failed. Please try again.',
    },
    profile: {
      stepLabel: 'Profile setup',
      heading: 'Tailor your practice studio',
      subtitle: 'Tell us what you are preparing for so Stagera can personalize venues, AI questions, and feedback.',
      languageLabel: 'App language',
      roleLabel: 'I am primarily a…',
      roles: {
        student: { label: 'Student', desc: 'Class talks, thesis defenses & capstones' },
        lecturer: { label: 'Lecturer', desc: 'Lectures, seminars & academic talks' },
        job_seeker: { label: 'Job seeker', desc: 'Behavioral & technical interviews' },
        professional: { label: 'Professional', desc: 'Pitches, keynotes & panels' },
      },
      fieldLabel: 'Field or domain',
      fieldOptional: 'Optional',
      fieldPlaceholder: 'e.g. Computer Science, Healthcare, Finance',
      goalsLabel: 'Practice goals',
      goalsHint: 'Select one or more goals to highlight in your reports.',
      difficultiesLabel: 'Biggest challenges',
      difficultiesHint: 'Helps the AI coach focus its hints and recommendations.',
      saveContinue: 'Save & go to dashboard',
      saving: 'Saving profile…',
      goalOptions: [
        { id: 'steady_pace', label: 'Keep a steady pace (120–150 WPM)' },
        { id: 'reduce_fillers', label: 'Reduce filler words (um, uh, like)' },
        { id: 'eye_contact', label: 'Balance eye contact across the room' },
        { id: 'handle_qa', label: 'Stay calm during tough Q&A' },
        { id: 'par_structure', label: 'Structure answers with PAR & "I"' },
        { id: 'time_control', label: 'Finish cleanly within the time limit' },
      ],
      difficultyOptions: [
        { id: 'nervousness', label: 'Stage fright / nervousness' },
        { id: 'speaking_fast', label: 'Speaking too fast' },
        { id: 'filler_words', label: 'Frequent filler words' },
        { id: 'losing_thread', label: 'Losing my train of thought' },
        { id: 'interruptions', label: 'Unexpected interruptions' },
        { id: 'reading_slides', label: 'Reading too much from slides' },
      ],
    },
    home: {
      greetingMorning: 'Good morning',
      greetingAfternoon: 'Good afternoon',
      greetingEvening: 'Good evening',
      subtitle: 'Ready for your next VR rehearsal?',
      newSession: 'New session',
      weeklyTitle: 'This week',
      weeklySessions: 'Sessions',
      weeklyMinutes: 'Minutes',
      weeklyAvgWpm: 'Avg pace',
      savedSetupsTitle: 'Saved setups',
      savedSetupsCount: 'ready',
      launchVr: 'Launch VR',
      coachedTag: 'Coached',
      minUnit: 'min',
      lastSessionTitle: 'Last session',
      viewReport: 'View report',
      metricWpm: 'Pace (WPM)',
      metricFillers: 'Fillers',
      metricEyeContact: 'Eye contact',
      metricTopics: 'Topics',
      noSessionsYet: 'No practice sessions recorded yet.',
      quickLaunchTitle: 'Quick launch VR rehearsal',
      quickLaunchVenue: 'Choose venue',
      quickLaunchStart: 'Open VR Stage',
      quickLaunchCancel: 'Cancel',
      navHome: 'Home',
      navHistory: 'History',
      navProgress: 'Progress',
      navSettings: 'Settings',
      historyTitle: 'Session history',
      historySubtitle: 'Your recent VR practice runs and key delivery metrics.',
      progressTitle: 'Your progress',
      progressSubtitle: 'Track consistency toward your weekly rehearsal target.',
      progressTargetLabel: 'Weekly session goal',
      progressWpmRange: 'Target speaking pace: 120–150 WPM',
      settingsTitle: 'Settings & privacy',
      settingsAccount: 'Account',
      settingsEditProfile: 'Edit profile & goals',
      settingsLanguage: 'App language',
      settingsCaptions: 'Live captions in VR',
      settingsCaptionsDesc: 'Captions ON by default for all audience and interviewer speech.',
      settingsKeepRecordings: 'Keep session recordings',
      settingsKeepRecordingsDesc: 'Store audio and metrics privately for moment replay.',
      settingsAutoDelete: 'Auto-delete after 30 days',
      settingsAutoDeleteDesc: 'Automatically purge older recordings (24h hard delete).',
      settingsDemoBadge: 'Demo mode',
      settingsSignOut: 'Sign out',
      venues: {
        classroom: 'Classroom (30)',
        lecture_hall: 'Lecture Hall (60)',
        auditorium: 'Auditorium (200)',
        interview_room: 'Interview Room (1)',
        panel_room: 'Panel Room (3)',
      },
      practiceTypes: {
        presentation: 'Presentation',
        interview: 'Interview',
        pitch: 'Pitch',
        panel: 'Panel',
      },
    },
    wizard: {
      stepOfTotal: 'Step {step} of {total}',
      back: 'Back',
      continue: 'Continue',
      extracting: 'Extracting topics…',
      practiceType: {
        heading: 'Choose practice type',
        subtitle: 'Pick the format that best matches your upcoming session.',
        cards: {
          presentation: {
            title: 'Presentation / Lecture',
            desc: 'Class talks, lectures, thesis defenses, or conference decks.',
            venueHint: 'Classroom · Lecture Hall · Auditorium',
          },
          interview: {
            title: 'Interview',
            desc: '1-on-1 or panel Q&A with behavioral PAR & role-specific follow-ups.',
            venueHint: 'Interview Room (1) · Panel Room (3)',
          },
          pitch: {
            title: 'Pitch',
            desc: 'Startup, product, or funding pitch with sharp investor questions.',
            venueHint: 'Classroom · Lecture Hall',
          },
          panel: {
            title: 'Panel discussion',
            desc: 'Moderated discussion with multi-speaker turn-taking and pushback.',
            venueHint: 'Panel Room (3)',
          },
        },
      },
      material: {
        heading: 'Upload your material',
        subtitle: 'Add your slides or notes so Stagera can track your topics and generate relevant Q&A.',
        dropzoneTitle: 'Drag & drop files here, or tap to browse',
        dropzoneSubtitle: 'PPTX, PDF, DOCX, or TXT',
        dropzoneLimit: 'Up to 25 MB per file · up to 50 slides',
        browseBtn: 'Choose file',
        uploadedFilesLabel: 'Attached material',
        removeFile: 'Remove',
        outlineLabel: 'Or paste a short outline',
        outlineOptional: 'Optional',
        outlinePlaceholder: '1. Opening & context\n2. Key findings\n3. Live demo\n4. Conclusions & Q&A',
        skipNoSlides: 'Skip (no slides)',
        errFileSize: 'File exceeds the 25 MB limit. Please upload a smaller file.',
        errFileType: 'Unsupported format. Please upload a PPTX, PDF, DOCX, or TXT file.',
      },
      interview: {
        heading: 'Interview details',
        subtitle: 'Share the role and a project you want to highlight so the AI interviewer tailors its questions.',
        jobTitleLabel: 'Target job title',
        jobTitlePlaceholder: 'e.g. Frontend Engineer, Product Manager',
        jdLabel: 'Job description',
        jdPlaceholder: 'Paste key responsibilities, required skills, or qualifications…',
        projectLabel: 'Project summary',
        projectPlaceholder: 'Briefly describe a project you led (problem, your actions, measurable result)…',
        cvLabel: 'CV / Resume',
        cvOptional: 'Optional',
        cvDropzoneTitle: 'Upload CV (PDF or DOCX)',
        cvDropzoneLimit: 'Up to 25 MB',
        cvErrType: 'Unsupported CV format. Please upload a PDF or DOCX file.',
        cvErrSize: 'CV exceeds the 25 MB limit.',
        removeCv: 'Remove',
        previewHeading: 'Themes we’ll ask about',
        previewHint: 'Updates live as you add role details.',
      },
      topics: {
        headingPresentation: 'Confirm planned topics',
        headingInterview: 'Confirm interview themes',
        subtitlePresentation: 'Edit, reorder, or mark topics as Brief before moving to venue & goals.',
        subtitleInterview: 'Adjust the themes the AI interviewer will cover and mark any quick warm-ups as Brief.',
        slideLabel: 'Slides',
        briefToggle: 'Brief',
        briefActiveLabel: 'Marked as brief',
        moveUp: 'Move topic up',
        moveDown: 'Move topic down',
        deleteTopic: 'Delete topic',
        editTopicLabel: 'Topic title',
        addPlaceholder: 'Add another topic or theme…',
        addBtn: 'Add',
        reextractBtn: 'Re-extract from material',
        emptyNotice: 'Add at least one topic so Stagera can track your coverage.',
        sessionTitleLabel: 'Session title',
        sessionTitlePlaceholder: 'e.g. Q3 Product Roadmap',
        saveAndLaunchVr: 'Save & launch VR',
        saveToSetups: 'Save to setups',
      },
    },
  },
  fr: {
    app: {
      step1: 'Étape 1 : Compagnon',
      step2: 'Étape 2 : Scène VR',
      step3: 'Étape 3 : Rapport',
      reportPlaceholderTitle: 'Rapport de session (Étape 3)',
      reportPlaceholderDesc:
        'Le débit (mots/min), le détail des tics de langage, les zones de contact visuel et les moments marqués apparaîtront ici.',
    },
    welcome: {
      title: 'Répétez avec assurance avant de monter sur scène.',
      subtitle:
        'Préparez votre session sur téléphone, entrez dans une salle réaliste sur Meta Quest 3 et recevez un coaching IA en direct.',
      feature1Title: '1. Préparez sur téléphone',
      feature1Desc: 'Importez vos diapositives ou notes, choisissez la salle et fixez vos objectifs en moins de 3 minutes.',
      feature2Title: '2. Pratiquez en WebXR',
      feature2Desc: 'Présentez devant 1 à 200 avatars réactifs avec contrôle vocal des diapositives et questions IA.',
      feature3Title: '3. Analysez et progressez',
      feature3Desc: 'Suivez votre débit, vos tics de langage, votre regard et rejouez les moments clés.',
      getStarted: 'Commencer',
      alreadyHaveAccount: 'J’ai déjà un compte',
      footerNote: 'Privé par défaut · English & Français · Conçu pour Meta Quest 3',
    },
    auth: {
      back: 'Retour',
      signupTab: 'Créer un compte',
      loginTab: 'Connexion',
      signupHeading: 'Créez votre compte Stagera',
      loginHeading: 'Bon retour',
      signupSubtitle: 'Enregistrez vos configurations de répétition, préférences VR et progrès sur tous vos appareils.',
      loginSubtitle: 'Connectez-vous pour retrouver vos configurations et vos sessions précédentes.',
      demoBannerTitle: 'Mode démo local actif',
      demoBannerDesc:
        'Les clés Supabase ne sont pas encore définies dans .env.local. Vous pouvez créer un compte, vous connecter ou tester Google localement.',
      continueWithGoogle: 'Continuer avec Google',
      orEmail: 'ou continuer par e-mail',
      fullNameLabel: 'Nom complet',
      fullNamePlaceholder: 'Camille Laurent',
      emailLabel: 'Adresse e-mail',
      emailPlaceholder: 'camille@universite.fr',
      passwordLabel: 'Mot de passe',
      passwordPlaceholder: 'Au moins 6 caractères',
      showPassword: 'Afficher',
      hidePassword: 'Masquer',
      createAccountCta: 'Créer un compte',
      loginCta: 'Se connecter',
      submitting: 'Veuillez patienter…',
      switchToLoginPrompt: 'Vous avez déjà un compte ?',
      switchToLoginLink: 'Se connecter',
      switchToSignupPrompt: 'Nouveau sur Stagera ?',
      switchToSignupLink: 'Créer un compte',
      errEmailRequired: 'Veuillez saisir une adresse e-mail valide.',
      errPasswordShort: 'Le mot de passe doit contenir au moins 6 caractères.',
      errNameRequired: 'Veuillez saisir votre nom complet.',
      errGeneric: 'Échec de l’authentification. Veuillez réessayer.',
    },
    profile: {
      stepLabel: 'Configuration du profil',
      heading: 'Personnalisez votre studio',
      subtitle: 'Dites-nous ce que vous préparez afin d’adapter les salles, les questions IA et les retours.',
      languageLabel: 'Langue de l’application',
      roleLabel: 'Je suis principalement…',
      roles: {
        student: { label: 'Étudiant(e)', desc: 'Exposés, soutenances et projets' },
        lecturer: { label: 'Enseignant(e)', desc: 'Cours magistraux, séminaires' },
        job_seeker: { label: 'Candidat(e)', desc: 'Entretiens comportementaux et techniques' },
        professional: { label: 'Professionnel(le)', desc: 'Pitchs, conférences et panels' },
      },
      fieldLabel: 'Domaine ou spécialité',
      fieldOptional: 'Facultatif',
      fieldPlaceholder: 'ex. Informatique, Santé, Finance',
      goalsLabel: 'Objectifs de pratique',
      goalsHint: 'Sélectionnez un ou plusieurs objectifs à suivre dans vos rapports.',
      difficultiesLabel: 'Principales difficultés',
      difficultiesHint: 'Aide le coach IA à cibler ses conseils et indices.',
      saveContinue: 'Enregistrer et ouvrir le tableau de bord',
      saving: 'Enregistrement…',
      goalOptions: [
        { id: 'steady_pace', label: 'Garder un débit régulier (120–150 mots/min)' },
        { id: 'reduce_fillers', label: 'Réduire les tics de langage (euh, donc)' },
        { id: 'eye_contact', label: 'Équilibrer le contact visuel dans la salle' },
        { id: 'handle_qa', label: 'Rester serein face aux questions difficiles' },
        { id: 'par_structure', label: 'Structurer mes réponses (PAR et « je »)' },
        { id: 'time_control', label: 'Respecter la limite de temps' },
      ],
      difficultyOptions: [
        { id: 'nervousness', label: 'Trac / nervosité sur scène' },
        { id: 'speaking_fast', label: 'Parler trop vite' },
        { id: 'filler_words', label: 'Tics de langage fréquents' },
        { id: 'losing_thread', label: 'Perdre le fil de mes idées' },
        { id: 'interruptions', label: 'Interruptions imprévues' },
        { id: 'reading_slides', label: 'Trop lire mes diapositives' },
      ],
    },
    home: {
      greetingMorning: 'Bonjour',
      greetingAfternoon: 'Bon après-midi',
      greetingEvening: 'Bonsoir',
      subtitle: 'Prêt pour votre prochaine répétition en VR ?',
      newSession: 'Nouvelle session',
      weeklyTitle: 'Cette semaine',
      weeklySessions: 'Sessions',
      weeklyMinutes: 'Minutes',
      weeklyAvgWpm: 'Débit moy.',
      savedSetupsTitle: 'Configurations enregistrées',
      savedSetupsCount: 'prêtes',
      launchVr: 'Lancer VR',
      coachedTag: 'Coaché',
      minUnit: 'min',
      lastSessionTitle: 'Dernière session',
      viewReport: 'Voir le rapport',
      metricWpm: 'Débit (m/min)',
      metricFillers: 'Hésitations',
      metricEyeContact: 'Regard',
      metricTopics: 'Sujets',
      noSessionsYet: 'Aucune session enregistrée pour le moment.',
      quickLaunchTitle: 'Lancement rapide VR',
      quickLaunchVenue: 'Choisir la salle',
      quickLaunchStart: 'Ouvrir la scène VR',
      quickLaunchCancel: 'Annuler',
      navHome: 'Accueil',
      navHistory: 'Historique',
      navProgress: 'Progrès',
      navSettings: 'Paramètres',
      historyTitle: 'Historique des sessions',
      historySubtitle: 'Vos dernières répétitions VR et leurs indicateurs clés.',
      progressTitle: 'Vos progrès',
      progressSubtitle: 'Suivez votre régularité par rapport à votre objectif hebdomadaire.',
      progressTargetLabel: 'Objectif hebdomadaire',
      progressWpmRange: 'Débit cible : 120–150 mots/min',
      settingsTitle: 'Paramètres et confidentialité',
      settingsAccount: 'Compte',
      settingsEditProfile: 'Modifier le profil et les objectifs',
      settingsLanguage: 'Langue de l’application',
      settingsCaptions: 'Sous-titres en direct en VR',
      settingsCaptionsDesc: 'Activés par défaut pour toutes les prises de parole de l’audience.',
      settingsKeepRecordings: 'Conserver les enregistrements',
      settingsKeepRecordingsDesc: 'Stocke l’audio et les métriques en privé pour le replay.',
      settingsAutoDelete: 'Suppression auto après 30 jours',
      settingsAutoDeleteDesc: 'Supprime automatiquement les anciens enregistrements (24h).',
      settingsDemoBadge: 'Mode démo',
      settingsSignOut: 'Se déconnecter',
      venues: {
        classroom: 'Salle de classe (30)',
        lecture_hall: 'Amphithéâtre (60)',
        auditorium: 'Auditorium (200)',
        interview_room: 'Salle d’entretien (1)',
        panel_room: 'Salle de panel (3)',
      },
      practiceTypes: {
        presentation: 'Présentation',
        interview: 'Entretien',
        pitch: 'Pitch',
        panel: 'Panel',
      },
    },
    wizard: {
      stepOfTotal: 'Étape {step} sur {total}',
      back: 'Retour',
      continue: 'Continuer',
      extracting: 'Extraction des sujets…',
      practiceType: {
        heading: 'Choisir le type de pratique',
        subtitle: 'Sélectionnez le format qui correspond le mieux à votre prochaine session.',
        cards: {
          presentation: {
            title: 'Présentation / Cours',
            desc: 'Exposés, cours magistraux, soutenances ou conférences avec diapositives.',
            venueHint: 'Salle de classe · Amphithéâtre · Auditorium',
          },
          interview: {
            title: 'Entretien',
            desc: 'Entretien individuel ou jury avec relances comportementales (PAR) et techniques.',
            venueHint: 'Salle d’entretien (1) · Salle de panel (3)',
          },
          pitch: {
            title: 'Pitch',
            desc: 'Pitch startup, produit ou levée de fonds avec questions incisives.',
            venueHint: 'Salle de classe · Amphithéâtre',
          },
          panel: {
            title: 'Table ronde / Panel',
            desc: 'Discussion modérée à plusieurs intervenants avec relances et contre-arguments.',
            venueHint: 'Salle de panel (3)',
          },
        },
      },
      material: {
        heading: 'Importer votre support',
        subtitle: 'Ajoutez vos diapositives ou notes afin que Stagera suive vos sujets et prépare les questions.',
        dropzoneTitle: 'Glissez-déposez vos fichiers ici, ou touchez pour parcourir',
        dropzoneSubtitle: 'PPTX, PDF, DOCX ou TXT',
        dropzoneLimit: 'Jusqu’à 25 Mo par fichier · 50 diapositives max.',
        browseBtn: 'Choisir un fichier',
        uploadedFilesLabel: 'Supports ajoutés',
        removeFile: 'Retirer',
        outlineLabel: 'Ou collez un court plan',
        outlineOptional: 'Facultatif',
        outlinePlaceholder: '1. Accroche et contexte\n2. Résultats clés\n3. Démo en direct\n4. Conclusion et questions',
        skipNoSlides: 'Passer (sans diapositives)',
        errFileSize: 'Le fichier dépasse la limite de 25 Mo. Veuillez choisir un fichier plus léger.',
        errFileType: 'Format non pris en charge. Importez un fichier PPTX, PDF, DOCX ou TXT.',
      },
      interview: {
        heading: 'Détails de l’entretien',
        subtitle: 'Indiquez le poste visé et un projet marquant pour adapter les questions du recruteur IA.',
        jobTitleLabel: 'Poste visé',
        jobTitlePlaceholder: 'ex. Ingénieur Frontend, Chef de produit',
        jdLabel: 'Description du poste',
        jdPlaceholder: 'Collez les missions principales, compétences requises ou qualifications…',
        projectLabel: 'Résumé de projet',
        projectPlaceholder: 'Décrivez brièvement un projet mené (problème, vos actions, résultat mesurable)…',
        cvLabel: 'CV',
        cvOptional: 'Facultatif',
        cvDropzoneTitle: 'Importer un CV (PDF ou DOCX)',
        cvDropzoneLimit: 'Jusqu’à 25 Mo',
        cvErrType: 'Format de CV non pris en charge. Importez un fichier PDF ou DOCX.',
        cvErrSize: 'Le CV dépasse la limite de 25 Mo.',
        removeCv: 'Retirer',
        previewHeading: 'Thèmes que nous aborderons',
        previewHint: 'Se met à jour en direct selon vos informations.',
      },
      topics: {
        headingPresentation: 'Confirmer les sujets prévus',
        headingInterview: 'Confirmer les thèmes d’entretien',
        subtitlePresentation: 'Modifiez, réordonnez ou marquez les sujets comme Bref avant de passer à la salle et aux objectifs.',
        subtitleInterview: 'Ajustez les thèmes que le recruteur IA abordera et marquez les introductions rapides comme Bref.',
        slideLabel: 'Diapos',
        briefToggle: 'Bref',
        briefActiveLabel: 'Marqué comme bref',
        moveUp: 'Monter le sujet',
        moveDown: 'Descendre le sujet',
        deleteTopic: 'Supprimer le sujet',
        editTopicLabel: 'Titre du sujet',
        addPlaceholder: 'Ajouter un autre sujet ou thème…',
        addBtn: 'Ajouter',
        reextractBtn: 'Ré-extraire depuis le support',
        emptyNotice: 'Ajoutez au moins un sujet pour que Stagera suive votre couverture.',
        sessionTitleLabel: 'Titre de la session',
        sessionTitlePlaceholder: 'ex. Feuille de route produit T3',
        saveAndLaunchVr: 'Enregistrer et lancer VR',
        saveToSetups: 'Enregistrer la config',
      },
    },
  },
}

export function getGreeting(lang: AppLanguage): string {
  const hour = new Date().getHours()
  const t = translations[lang].home
  if (hour < 12) return t.greetingMorning
  if (hour < 18) return t.greetingAfternoon
  return t.greetingEvening
}
