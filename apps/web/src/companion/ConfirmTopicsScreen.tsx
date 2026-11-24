import { useState, type FormEvent } from 'react'
import { translations } from '../lib/i18n'
import type { AppLanguage, PracticeType, Topic } from '../types/stagera'

interface ConfirmTopicsScreenProps {
  language: AppLanguage
  practiceType: PracticeType
  sessionTitle: string
  topics: Topic[]
  isExtracting: boolean
  onSessionTitleChange: (title: string) => void
  onTopicsChange: (topics: Topic[]) => void
  onReextract: () => void
  onContinue: () => void
}

export function ConfirmTopicsScreen({
  language,
  practiceType,
  sessionTitle,
  topics,
  isExtracting,
  onSessionTitleChange,
  onTopicsChange,
  onReextract,
  onContinue,
}: ConfirmTopicsScreenProps) {
  const t = translations[language].wizard
  const [newTopicText, setNewTopicText] = useState('')
  const isInterview = practiceType === 'interview'

  const handleUpdateTitle = (id: string, title: string) => {
    onTopicsChange(topics.map((item) => (item.id === id ? { ...item, title } : item)))
  }

  const handleToggleBrief = (id: string) => {
    onTopicsChange(topics.map((item) => (item.id === id ? { ...item, brief: !item.brief } : item)))
  }

  const handleMove = (index: number, direction: -1 | 1) => {
    const target = index + direction
    if (target < 0 || target >= topics.length) return
    const next = [...topics]
    const [moved] = next.splice(index, 1)
    next.splice(target, 0, moved)
    onTopicsChange(next)
  }

  const handleDelete = (id: string) => {
    onTopicsChange(topics.filter((item) => item.id !== id))
  }

  const handleAddTopic = (e: FormEvent) => {
    e.preventDefault()
    const trimmed = newTopicText.trim()
    if (!trimmed) return
    const added: Topic = {
      id: `topic-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      title: trimmed,
      brief: false,
    }
    onTopicsChange([...topics, added])
    setNewTopicText('')
  }

  const validTopics = topics.filter((item) => item.title.trim().length > 0)

  return (
    <div className="wizard-body">
      <h1 className="screen-title">
        {isInterview ? t.topics.headingInterview : t.topics.headingPresentation}
      </h1>
      <p className="screen-subtitle">
        {isInterview ? t.topics.subtitleInterview : t.topics.subtitlePresentation}
      </p>

      <div className="field-group" style={{ marginBottom: 16 }}>
        <label htmlFor="wizard-session-title" className="field-label">
          {t.topics.sessionTitleLabel}
        </label>
        <input
          id="wizard-session-title"
          type="text"
          className="text-input"
          value={sessionTitle}
          placeholder={t.topics.sessionTitlePlaceholder}
          onChange={(e) => onSessionTitleChange(e.target.value)}
        />
      </div>

      {topics.length === 0 ? (
        <div className="empty-topics-box" role="status">
          {t.topics.emptyNotice}
        </div>
      ) : (
        <ol className="topic-editor-list">
          {topics.map((topic, index) => (
            <li key={topic.id} className="topic-editor-row">
              <div className="topic-editor-top">
                <span className="topic-index-badge" aria-hidden="true">
                  {index + 1}
                </span>
                <input
                  type="text"
                  className="topic-title-input"
                  aria-label={`${t.topics.editTopicLabel} ${index + 1}`}
                  value={topic.title}
                  onChange={(e) => handleUpdateTitle(topic.id, e.target.value)}
                />
              </div>

              <div className="topic-editor-controls">
                <div className="topic-editor-meta">
                  {topic.slideRange && (
                    <span className="topic-slide-tag">
                      {t.topics.slideLabel} {topic.slideRange}
                    </span>
                  )}
                  <button
                    type="button"
                    aria-pressed={topic.brief}
                    aria-label={
                      topic.brief ? `${topic.title}: ${t.topics.briefActiveLabel}` : `${topic.title}: ${t.topics.briefToggle}`
                    }
                    className={`brief-toggle-btn ${topic.brief ? 'active' : ''}`}
                    onClick={() => handleToggleBrief(topic.id)}
                  >
                    {t.topics.briefToggle}
                  </button>
                </div>

                <div className="topic-order-actions">
                  <button
                    type="button"
                    className="icon-action-btn"
                    disabled={index === 0}
                    aria-label={`${t.topics.moveUp}: ${topic.title}`}
                    onClick={() => handleMove(index, -1)}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="icon-action-btn"
                    disabled={index === topics.length - 1}
                    aria-label={`${t.topics.moveDown}: ${topic.title}`}
                    onClick={() => handleMove(index, 1)}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className="icon-action-btn icon-action-btn--danger"
                    aria-label={`${t.topics.deleteTopic}: ${topic.title}`}
                    onClick={() => handleDelete(topic.id)}
                  >
                    ✕
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}

      <form className="add-topic-form" onSubmit={handleAddTopic}>
        <input
          id="wizard-add-topic-input"
          type="text"
          className="text-input"
          value={newTopicText}
          placeholder={t.topics.addPlaceholder}
          onChange={(e) => setNewTopicText(e.target.value)}
        />
        <button
          id="wizard-add-topic-btn"
          type="submit"
          className="btn-small"
          disabled={newTopicText.trim().length === 0}
        >
          + {t.topics.addBtn}
        </button>
      </form>

      <div className="reextract-row">
        <button
          id="wizard-reextract-btn"
          type="button"
          className="link-btn"
          disabled={isExtracting}
          onClick={onReextract}
        >
          {isExtracting ? t.extracting : t.topics.reextractBtn}
        </button>
      </div>

      <div className="wizard-footer-actions">
        <button
          id="wizard-step3-continue"
          type="button"
          className="btn-primary"
          disabled={validTopics.length === 0}
          onClick={onContinue}
        >
          {t.continue}
        </button>
      </div>
    </div>
  )
}
