import type { ChatGptRenderedCatalog } from '@codex-context-bridge/contracts';
import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  CodexTargetCatalog,
  PilotNoteInput,
  PilotView,
  PilotViewResponse,
} from '../pilot-contracts';
import type { ProjectView } from '../project-ipc';

export const SAMPLE_PILOT_OBJECTIVE = `Hãy tạo một trang web tĩnh đơn giản bằng HTML và CSS.

Trang chỉ cần:
1. Một dòng tiêu đề: “Xin chào từ AI”
2. Một đoạn văn: “Đây là trang web thử nghiệm được tạo thông qua ChatGPT và Codex Context Bridge.”

Không dùng framework.
Không dùng thư viện ngoài.
Không dùng tài nguyên mạng.
Không cần JavaScript.
Thiết kế rõ ràng, dễ đọc.`;

const statusLabels: Record<PilotView['status'], string> = {
  draft: 'Bản nháp',
  chatgpt_ready: 'Chờ duyệt ChatGPT',
  chatgpt_dispatched: 'Đang chờ ChatGPT',
  chatgpt_confirmation_required: 'Cần xác nhận lần gửi',
  codex_ready: 'Chờ duyệt Codex',
  codex_running: 'Codex đang chạy',
  codex_completed: 'Codex hoàn tất',
  failed: 'Đã dừng vì lỗi',
};

const accountTransferLabels: Record<NonNullable<PilotView['accountTransfer']>['status'], string> = {
  review_required: 'Chờ xem trước và xác nhận',
  dispatching: 'Đang xác minh lần gửi',
  confirmation_required: 'Cần kiểm tra lần gửi',
  manual_attachment_required: 'ZIP quá lớn - cần đính kèm thủ công',
  completed: 'Đã liên kết account mới',
  failed: 'Chuyển account thất bại',
};

function shortHash(value: string | undefined): string {
  return value ? `${value.slice(0, 12)}…${value.slice(-8)}` : 'Chưa có';
}

function errorText(response: PilotViewResponse): string {
  if (response.ok) return '';
  if (response.error.code === 'CHATGPT_CONVERSATION_UNAVAILABLE') {
    return 'Cuộc chat không khả dụng trong tài khoản/workspace hiện tại. Hãy mở đúng conversation trong Edge rồi nhấn "Kiểm tra ChatGPT"; nếu vẫn lỗi, tạo pilot mới với "Conversation đang mở".';
  }
  if (response.error.code === 'CHAT_TRANSFER_SECRET_DETECTED') {
    return 'Gói chuyển bị chặn vì lịch sử có dữ liệu giống secret hoặc credential. File lưu trữ cũ vẫn còn trong SQLite; hãy kiểm tra và loại bỏ dữ liệu nhạy cảm trước khi gửi sang account khác.';
  }
  return `${response.error.code}: ${response.error.message}`;
}

function destinationUrl(view: PilotView): string {
  return view.destination.mode === 'existing'
    ? `https://chatgpt.com${view.destination.conversationPath ?? `/c/${view.destination.conversationId}`}`
    : 'https://chatgpt.com/';
}

export function LiveProjectPilot({
  projectId,
  projectName,
  repositories,
}: {
  projectId: string;
  projectName: string;
  repositories: ProjectView['repositories'];
}): React.JSX.Element {
  const [items, setItems] = useState<PilotView[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [targetProjectId, setTargetProjectId] = useState(projectId);
  const [repositoryId, setRepositoryId] = useState(repositories[0]?.id ?? '');
  const [objective, setObjective] = useState('');
  const [draftNotes, setDraftNotes] = useState<PilotNoteInput[]>([]);
  const [noteText, setNoteText] = useState('');
  const [noteTarget, setNoteTarget] = useState<'chatgpt' | 'codex'>('chatgpt');
  const [noteMode, setNoteMode] = useState<'once' | 'repeat'>('once');
  const [destinationMode, setDestinationMode] = useState<'current' | 'new' | 'existing'>('new');
  const [conversationId, setConversationId] = useState('');
  const [conversationPath, setConversationPath] = useState('');
  const [threadMappingId, setThreadMappingId] = useState('');
  const [chatCatalog, setChatCatalog] = useState<ChatGptRenderedCatalog>();
  const [chatCatalogError, setChatCatalogError] = useState('');
  const [codexTargets, setCodexTargets] = useState<CodexTargetCatalog>({ projects: [] });
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(() => new Set([projectId]));
  const [threadLimits, setThreadLimits] = useState<Record<string, number>>({});
  const [chatLimit, setChatLimit] = useState(5);
  const [messageLimit, setMessageLimit] = useState(5);
  const [transport, setTransport] = useState('Chưa kiểm tra');
  const [notice, setNotice] = useState('Chưa có dữ liệu nào được gửi.');
  const [busy, setBusy] = useState(false);
  const archiveSyncing = useRef(false);

  const selected = useMemo(
    () => items.find((item) => item.id === selectedId) ?? items[0],
    [items, selectedId],
  );
  const selectedNotes = selected?.operatorNotes ?? [];
  const selectedMessages = selected?.chatArchive?.latestMessages ?? [];
  const activeItems = useMemo(
    () => items.filter((item) => ['chatgpt_dispatched', 'codex_running'].includes(item.status)),
    [items],
  );
  const activeTransfers = useMemo(
    () => items.filter((item) => item.accountTransfer?.status === 'dispatching'),
    [items],
  );
  const activeKey = [
    ...activeItems.map((item) => `${item.id}:${item.status}`),
    ...activeTransfers.map((item) => `${item.id}:account-transfer`),
  ].join('|');
  const selectedTargetProject =
    codexTargets.projects.find((item) => item.projectId === targetProjectId) ??
    codexTargets.projects.find((item) => item.projectId === projectId);
  const targetRepositories = selectedTargetProject?.repositories ?? repositories;
  const selectedRepository = targetRepositories.find((item) => item.id === repositoryId);

  const noteTargetLabel = (target: 'chatgpt' | 'codex'): string =>
    target === 'chatgpt' ? 'ChatGPT' : 'Codex';

  const addDraftNote = (): void => {
    const text = noteText.trim();
    if (!text) return;
    setDraftNotes((current) => [...current, { target: noteTarget, mode: noteMode, text }]);
    setNoteText('');
  };

  const addNoteToSelected = async (): Promise<void> => {
    if (!selected || !noteText.trim()) return;
    const notes: PilotNoteInput[] = [
      ...selectedNotes.map(({ id, target, mode, text }) => ({ id, target, mode, text })),
      { target: noteTarget, mode: noteMode, text: noteText.trim() },
    ];
    await run(
      () => window.contextBridgeDesktop.updatePilotNotes({ pilotId: selected.id, notes }),
      'Đã lưu ghi chú vào pilot; ghi chú một lần chỉ bị đánh dấu sau khi gửi được xác nhận.',
    );
    setNoteText('');
  };

  const replace = (view: PilotView): void => {
    setItems((current) => [view, ...current.filter((item) => item.id !== view.id)]);
    setSelectedId(view.id);
  };

  const merge = (view: PilotView): void => {
    setItems((current) => current.map((item) => (item.id === view.id ? view : item)));
  };

  const remove = async (pilotId: string): Promise<void> => {
    if (
      !window.confirm(
        `Xóa reviewed handoff ${pilotId.slice(0, 8)}? Lịch sử workflow, audit và file ZIP vẫn được giữ.`,
      )
    ) {
      return;
    }
    setBusy(true);
    const response = await window.contextBridgeDesktop.deletePilot(pilotId);
    setBusy(false);
    if (!response.ok) {
      setNotice(`${response.error.code}: ${response.error.message}`);
      return;
    }
    const index = items.findIndex((item) => item.id === pilotId);
    const remaining = items.filter((item) => item.id !== pilotId);
    setItems(remaining);
    setSelectedId((current) =>
      current === pilotId ? (remaining[Math.min(index, remaining.length - 1)]?.id ?? '') : current,
    );
    setNotice(
      `Đã xóa reviewed handoff ${pilotId.slice(0, 8)}. Workflow và audit log không bị xóa.`,
    );
  };

  const load = async (): Promise<void> => {
    const [pilots, health, targets, discovered] = await Promise.all([
      window.contextBridgeDesktop.listPilots(),
      window.contextBridgeDesktop.getTransportStatus(),
      window.contextBridgeDesktop.listPilotCodexTargets(),
      window.contextBridgeDesktop.discoverPilotChatGpt(),
    ]);
    if (pilots.ok) {
      setItems(pilots.value);
      setSelectedId((current) =>
        pilots.value.some((item) => item.id === current) ? current : (pilots.value[0]?.id ?? ''),
      );
    } else {
      setNotice(`${pilots.error.code}: ${pilots.error.message}`);
    }
    if (targets.ok) {
      setCodexTargets(targets.value);
      const preferred =
        targets.value.projects.find((item) => item.projectId === projectId) ??
        targets.value.projects[0];
      if (preferred) {
        setTargetProjectId((current) =>
          targets.value.projects.some((item) => item.projectId === current)
            ? current
            : preferred.projectId,
        );
        setRepositoryId((current) =>
          preferred.repositories.some((item) => item.id === current)
            ? current
            : (preferred.repositories[0]?.id ?? ''),
        );
      }
    }
    if (discovered.ok) {
      setChatCatalog(discovered.value);
      setChatCatalogError('');
    } else {
      setChatCatalogError(`${discovered.error.code}: ${discovered.error.message}`);
    }
    setTransport(
      health.ok
        ? `${health.value.state} / nativeMessaging ${health.value.permissionActive ? 'active' : 'inactive'}${health.value.lastErrorCode ? ` / ${health.value.lastErrorCode}` : ''}`
        : `${health.error.code}: unavailable`,
    );
  };

  useEffect(() => {
    setTargetProjectId(projectId);
    setRepositoryId(repositories[0]?.id ?? '');
    void load();
  }, [projectId, repositories[0]?.id]);

  useEffect(() => {
    setMessageLimit(5);
  }, [selected?.id, selected?.chatArchive?.latestContentHash]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void Promise.all([
        window.contextBridgeDesktop.discoverPilotChatGpt(),
        window.contextBridgeDesktop.listPilotCodexTargets(),
      ]).then(([discovered, targets]) => {
        if (discovered.ok) {
          setChatCatalog(discovered.value);
          setChatCatalogError('');
        }
        if (targets.ok) setCodexTargets(targets.value);
      });
    }, 15_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (activeItems.length === 0 && activeTransfers.length === 0) return;
    const timer = window.setInterval(() => {
      void (async () => {
        for (const item of activeItems) {
          const response =
            item.status === 'chatgpt_dispatched'
              ? await window.contextBridgeDesktop.capturePilotChatGpt(item.id)
              : await window.contextBridgeDesktop.refreshPilot(item.id);
          if (response.ok) {
            merge(response.value);
            if (response.value.status === 'codex_ready') {
              setNotice('Structured response đã được xác thực. Hãy duyệt Codex prompt.');
            } else if (response.value.status === 'codex_completed') {
              setNotice('Codex đã hoàn tất. Báo cáo và ZIP đã được lưu nếu vượt kiểm tra an toàn.');
            }
          } else if (
            !['CHATGPT_NOT_READY', 'CHATGPT_CONFIRMATION_REQUIRED'].includes(response.error.code)
          ) {
            setNotice(errorText(response));
          }
        }
        for (const item of activeTransfers) {
          const response = await window.contextBridgeDesktop.capturePilotAccountTransfer(item.id);
          if (response.ok) {
            merge(response.value);
            if (response.value.accountTransfer?.status === 'completed') {
              setNotice(
                'Đã xác minh tin nhắn trong chat mới và liên kết conversation đó với project Codex hiện tại.',
              );
            }
          } else if (response.error.code !== 'CHAT_TRANSFER_CONFIRMATION_REQUIRED') {
            setNotice(errorText(response));
          }
        }
      })();
    }, 2_000);
    return () => window.clearInterval(timer);
  }, [activeKey]);

  useEffect(() => {
    if (selected?.destination.mode !== 'existing') return;
    if (
      selected.accountTransfer &&
      ['review_required', 'dispatching', 'confirmation_required'].includes(
        selected.accountTransfer.status,
      )
    ) {
      return;
    }
    let active = true;
    const sync = async (): Promise<void> => {
      if (archiveSyncing.current) return;
      archiveSyncing.current = true;
      try {
        const response = await window.contextBridgeDesktop.syncPilotChatHistory(selected.id);
        if (active) {
          if (response.ok) {
            replace(response.value);
          } else if (response.error.code === 'CHATGPT_CONVERSATION_UNAVAILABLE') {
            setNotice(errorText(response));
          }
        }
      } catch {
        // Automatic sync is best-effort; the manual action surfaces actionable errors.
      } finally {
        archiveSyncing.current = false;
      }
    };
    void sync();
    const timer = window.setInterval(() => void sync(), 30_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [selected?.id, selected?.destination.mode, selected?.accountTransfer?.status]);

  const run = async (
    action: () => Promise<PilotViewResponse>,
    successMessage: string,
  ): Promise<void> => {
    setBusy(true);
    const response = await action();
    setBusy(false);
    if (!response.ok) {
      setNotice(errorText(response));
      return;
    }
    replace(response.value);
    setNotice(successMessage);
  };

  const refreshCodexCatalog = async (): Promise<void> => {
    setBusy(true);
    const response = await window.contextBridgeDesktop.listPilotCodexTargets();
    setBusy(false);
    if (!response.ok) {
      setNotice(`${response.error.code}: ${response.error.message}`);
      return;
    }
    setCodexTargets(response.value);
    const preferred =
      response.value.projects.find((item) => item.projectId === targetProjectId) ??
      response.value.projects[0];
    if (preferred) {
      setTargetProjectId(preferred.projectId);
      setRepositoryId(preferred.repositories[0]?.id ?? '');
    }
    setNotice(
      `Đã đồng bộ ${String(response.value.projects.length)} project từ Codex Desktop và registry an toàn.`,
    );
  };

  const refreshChatGptCatalog = async (): Promise<void> => {
    setBusy(true);
    const response = await window.contextBridgeDesktop.discoverPilotChatGpt({ openIfNeeded: true });
    setBusy(false);
    if (!response.ok) {
      const error = `${response.error.code}: ${response.error.message}`;
      setChatCatalogError(error);
      setNotice(error);
      return;
    }
    setChatCatalog(response.value);
    setChatCatalogError('');
    setNotice(
      `Đã đọc ${String(response.value.conversations.length)} đoạn chat từ các tab ChatGPT đang mở.`,
    );
  };

  const create = async (): Promise<void> => {
    if (!targetProjectId || !repositoryId || !objective.trim()) return;
    await run(
      () =>
        window.contextBridgeDesktop.createPilot({
          projectId: targetProjectId,
          repositoryId,
          objective,
          ...(draftNotes.length > 0 ? { operatorNotes: draftNotes } : {}),
          destination:
            destinationMode === 'current'
              ? { mode: 'current' }
              : destinationMode === 'existing'
                ? {
                    mode: 'existing',
                    conversationId: conversationId.trim(),
                    ...(conversationPath ? { conversationPath } : {}),
                  }
                : { mode: 'new' },
          codexDestination: threadMappingId
            ? { mode: 'existing-thread', threadMappingId }
            : { mode: 'new-thread', repositoryId },
        }),
      'Pilot đã được tạo trong SQLite. Chưa gửi ChatGPT hoặc Codex.',
    );
  };

  const selectConversation = (
    conversation: ChatGptRenderedCatalog['conversations'][number],
  ): void => {
    setDestinationMode('existing');
    setConversationId(conversation.conversationId);
    setConversationPath(conversation.conversationPath);
  };

  const selectCodexProject = (selectedProjectId: string): void => {
    const target = codexTargets.projects.find((item) => item.projectId === selectedProjectId);
    if (!target) return;
    setTargetProjectId(target.projectId);
    setRepositoryId(target.repositories[0]?.id ?? '');
    setThreadMappingId('');
    setExpandedProjects((current) => {
      const next = new Set(current);
      if (next.has(target.projectId)) next.delete(target.projectId);
      else next.add(target.projectId);
      return next;
    });
  };

  const selectCodexThread = (selectedProjectId: string, mappingId: string): void => {
    const target = codexTargets.projects.find((item) => item.projectId === selectedProjectId);
    const thread = target?.threads.find((item) => item.mappingId === mappingId);
    const repository = target?.repositories.find(
      (item) => item.fingerprint === thread?.repositoryFingerprint,
    );
    if (!target || !thread || !repository) return;
    setTargetProjectId(target.projectId);
    setRepositoryId(repository.id);
    setThreadMappingId(thread.mappingId);
  };

  const exportHistory = async (): Promise<void> => {
    if (!selected) return;
    setBusy(true);
    const response = await window.contextBridgeDesktop.exportPilotChatHistory(selected.id);
    setBusy(false);
    if (!response.ok) {
      setNotice(`${response.error.code}: ${response.error.message}`);
      return;
    }
    setNotice(
      response.value.canceled
        ? 'Đã hủy xuất lịch sử; dữ liệu lưu trong SQLite không thay đổi.'
        : `Đã xuất ${String(response.value.conversationCount)} cuộc chat, ${String(response.value.revisionCount)} phiên bản vào ${response.value.filePath ?? ''}.`,
    );
  };

  const updateChatSelection = async (ordinals: number[]): Promise<void> => {
    if (!selected) return;
    await run(
      () =>
        window.contextBridgeDesktop.updatePilotChatSelection({ pilotId: selected.id, ordinals }),
      ordinals.length > 0
        ? `Đã chọn ${String(ordinals.length)} tin nhắn làm ngữ cảnh cho ChatGPT.`
        : 'Đã bỏ chọn ngữ cảnh hội thoại; handoff sẽ không gửi đoạn trích cũ.',
    );
  };

  const prepareAccountTransfer = async (): Promise<void> => {
    if (!selected) return;
    await run(
      () => window.contextBridgeDesktop.preparePilotAccountTransfer(selected.id),
      'Đã đóng gói lịch sử cũ và mở chat mới trong account hiện tại. Hãy xem trước trước khi gửi.',
    );
  };

  return (
    <section className="pilot-deck" aria-label="Live Project Pilot">
      <header className="pilot-header">
        <div>
          <p className="eyebrow">LIVE PROJECT PILOT / EXPLICIT APPROVALS</p>
          <h2>ChatGPT phân tích. Codex xây dựng. Bạn duyệt từng lần gửi.</h2>
        </div>
        <div className="pilot-status" role="status">
          <span>Native transport</span>
          <strong>{transport}</strong>
          <small>{notice}</small>
        </div>
      </header>

      <div className="pilot-grid">
        <div className="pilot-compose">
          <div className="section-heading compact light">
            <span>01</span>
            <h2>Project & request</h2>
          </div>
          <dl className="pilot-facts">
            <div>
              <dt>Project</dt>
              <dd>{selectedTargetProject?.projectName ?? projectName}</dd>
            </div>
            <div>
              <dt>Repository</dt>
              <dd>{selectedRepository?.branch ?? 'branch chưa ghi nhận'}</dd>
            </div>
          </dl>
          <div className="pilot-target-browser" aria-label="Danh sách dự án và đoạn chat Codex">
            <div className="pilot-card-heading">
              <div>
                <span>CODEX DESKTOP — TỰ ĐỘNG</span>
                <strong>{threadMappingId ? 'Tiếp tục đoạn chat' : 'Chọn project chính'}</strong>
              </div>
              <button type="button" disabled={busy} onClick={() => void refreshCodexCatalog()}>
                Đồng bộ project Codex
              </button>
            </div>
            {codexTargets.projects.length === 0 && (
              <p className="pilot-empty">
                Chưa tìm thấy project Git hợp lệ trong Codex Desktop. App không yêu cầu nhập tên thủ
                công; hãy mở project đó một lần trong Codex rồi nhấn đồng bộ.
              </p>
            )}
            {codexTargets.projects.map((target) => {
              const expanded = expandedProjects.has(target.projectId);
              const limit = threadLimits[target.projectId] ?? 5;
              return (
                <div className="pilot-target-project" key={target.projectId}>
                  <button
                    type="button"
                    className={target.projectId === targetProjectId ? 'active' : ''}
                    onClick={() => selectCodexProject(target.projectId)}
                  >
                    <span>{expanded ? '−' : '+'}</span>
                    <strong>{target.projectName}</strong>
                    <small>{target.threads.length} đoạn chat</small>
                  </button>
                  {expanded && (
                    <div className="pilot-target-threads">
                      {target.threads.slice(0, limit).map((thread) => (
                        <button
                          type="button"
                          className={thread.mappingId === threadMappingId ? 'active' : ''}
                          key={thread.mappingId}
                          onClick={() => selectCodexThread(target.projectId, thread.mappingId)}
                        >
                          <strong>
                            {thread.title ?? `Codex thread ${thread.externalThreadId.slice(0, 12)}`}
                          </strong>
                          <small>
                            {thread.externalThreadId.slice(0, 18)} ·{' '}
                            {new Date(thread.updatedAt).toLocaleString('vi-VN')}
                          </small>
                        </button>
                      ))}
                      {target.threads.length > limit && (
                        <button
                          type="button"
                          className="show-more"
                          onClick={() =>
                            setThreadLimits((current) => ({
                              ...current,
                              [target.projectId]: limit + 5,
                            }))
                          }
                        >
                          Hiện thêm 5 đoạn chat
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <label className="pilot-field">
            <span>Repository đích</span>
            <select
              aria-label="Repository đích cho Live Project Pilot"
              value={repositoryId}
              onChange={(event) => {
                setRepositoryId(event.target.value);
                setThreadMappingId('');
              }}
            >
              {targetRepositories.map((repository) => (
                <option key={repository.id} value={repository.id}>
                  {repository.canonicalRoot}
                </option>
              ))}
            </select>
          </label>
          <label className="pilot-field">
            <span>Yêu cầu</span>
            <textarea
              aria-label="Yêu cầu Live Project Pilot"
              maxLength={20_000}
              rows={10}
              value={objective}
              onChange={(event) => setObjective(event.target.value)}
            />
          </label>
          <div className="pilot-inline">
            <button type="button" onClick={() => setObjective(SAMPLE_PILOT_OBJECTIVE)}>
              Dùng yêu cầu mẫu
            </button>
            <span>{objective.length.toLocaleString()} / 20.000 ký tự</span>
          </div>
          <div className="pilot-notes-editor" aria-label="Ghi chú điều khiển pilot mới">
            <div className="pilot-card-heading">
              <div>
                <span>OPERATOR NOTES</span>
                <strong>Ghi chú có kiểm soát</strong>
              </div>
              <small>Không tự gửi; chỉ đưa vào preview sau khi bạn xem.</small>
            </div>
            <div className="pilot-note-controls">
              <select
                aria-label="Đích ghi chú"
                value={noteTarget}
                onChange={(event) => setNoteTarget(event.target.value as 'chatgpt' | 'codex')}
              >
                <option value="chatgpt">Cho ChatGPT</option>
                <option value="codex">Cho Codex</option>
              </select>
              <select
                aria-label="Chế độ ghi chú"
                value={noteMode}
                onChange={(event) => setNoteMode(event.target.value as 'once' | 'repeat')}
              >
                <option value="once">Một lần</option>
                <option value="repeat">Lặp lại</option>
              </select>
            </div>
            <textarea
              aria-label="Ghi chú operator"
              maxLength={10_000}
              rows={3}
              value={noteText}
              onChange={(event) => setNoteText(event.target.value)}
              placeholder="Ví dụ: ưu tiên kiểm tra lỗi mobile trước"
            />
            <button type="button" disabled={!noteText.trim()} onClick={addDraftNote}>
              Thêm ghi chú cho pilot mới
            </button>
            {draftNotes.length > 0 && (
              <ul className="pilot-note-list">
                {draftNotes.map((note, index) => (
                  <li key={`${note.target}-${note.mode}-${String(index)}`}>
                    <span>
                      {noteTargetLabel(note.target)} ·{' '}
                      {note.mode === 'repeat' ? 'lặp lại' : 'một lần'}
                    </span>
                    <strong>{note.text}</strong>
                    <button
                      type="button"
                      aria-label={`Xóa ghi chú mới ${String(index + 1)}`}
                      onClick={() =>
                        setDraftNotes((current) =>
                          current.filter((_, itemIndex) => itemIndex !== index),
                        )
                      }
                    >
                      Xóa
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <fieldset className="pilot-destination">
            <legend>ChatGPT destination</legend>
            <div className="pilot-chat-catalog" aria-label="Danh sách đoạn chat ChatGPT đã render">
              <div className="pilot-card-heading">
                <div>
                  <span>CHATGPT SIDEBAR</span>
                  <strong>{chatCatalog?.conversations.length ?? 0} đoạn chat nhận diện được</strong>
                </div>
                <button type="button" disabled={busy} onClick={() => void refreshChatGptCatalog()}>
                  Đồng bộ đoạn chat ChatGPT
                </button>
              </div>
              {chatCatalogError && <p className="pilot-empty">{chatCatalogError}</p>}
              {!chatCatalogError && (chatCatalog?.conversations.length ?? 0) === 0 && (
                <p className="pilot-empty">
                  Chưa thấy đoạn chat trong các sidebar đang render. Hãy mở sidebar ChatGPT, mở đúng
                  tài khoản/workspace rồi nhấn đồng bộ.
                </p>
              )}
              {chatCatalog?.conversations.slice(0, chatLimit).map((conversation) => (
                <button
                  type="button"
                  className={conversation.conversationId === conversationId ? 'active' : ''}
                  key={conversation.conversationPath}
                  onClick={() => selectConversation(conversation)}
                >
                  <strong>{conversation.title}</strong>
                  <small>
                    https://chatgpt.com{conversation.conversationPath} ·{' '}
                    {conversation.projectName ?? 'Chat độc lập'}
                  </small>
                </button>
              ))}
              {(chatCatalog?.conversations.length ?? 0) > chatLimit && (
                <button
                  type="button"
                  className="show-more"
                  onClick={() => setChatLimit(chatLimit + 5)}
                >
                  Hiện thêm 5 đoạn chat
                </button>
              )}
              {chatCatalog?.truncated && (
                <small>Sidebar có hơn 200 mục; hãy thu gọn hoặc tìm đúng dự án trên ChatGPT.</small>
              )}
            </div>
            <label>
              <input
                aria-label="Dùng conversation ChatGPT đang mở"
                type="radio"
                name="pilot-destination"
                checked={destinationMode === 'current'}
                onChange={() => {
                  setDestinationMode('current');
                  setConversationPath('');
                }}
              />
              Conversation đang mở
            </label>
            <label>
              <input
                type="radio"
                name="pilot-destination"
                checked={destinationMode === 'new'}
                onChange={() => {
                  setDestinationMode('new');
                  setConversationPath('');
                }}
              />
              New chat an toàn
            </label>
            <label>
              <input
                type="radio"
                name="pilot-destination"
                checked={destinationMode === 'existing'}
                onChange={() => setDestinationMode('existing')}
              />
              Conversation xác định
            </label>
            {destinationMode === 'existing' && (
              <input
                aria-label="Conversation ID ChatGPT"
                value={conversationId}
                onChange={(event) => {
                  setConversationId(event.target.value);
                  setConversationPath('');
                }}
                placeholder="Conversation ID"
              />
            )}
          </fieldset>
          <button
            className="pilot-primary"
            type="button"
            disabled={
              busy ||
              !repositoryId ||
              !objective.trim() ||
              (destinationMode === 'existing' && !conversationId.trim())
            }
            onClick={() => void create()}
          >
            Tạo Live Project Pilot
          </button>
        </div>

        <div className="pilot-review">
          <div className="section-heading compact light">
            <span>02</span>
            <h2>Reviewed handoffs</h2>
            <b>{items.length}</b>
          </div>
          <div className="pilot-run-tabs" aria-label="Danh sách Live Project Pilot">
            {items.map((item) => (
              <div className={item.id === selected?.id ? 'active' : ''} key={item.id}>
                <button
                  className="pilot-run-select"
                  type="button"
                  aria-pressed={item.id === selected?.id}
                  onClick={() => setSelectedId(item.id)}
                >
                  <span>{statusLabels[item.status]}</span>
                  <small>{item.id.slice(0, 8)}</small>
                </button>
                <button
                  className="pilot-run-delete"
                  type="button"
                  disabled={busy}
                  aria-label={`Xóa reviewed handoff ${item.id}`}
                  onClick={() => void remove(item.id)}
                >
                  Xóa
                </button>
              </div>
            ))}
          </div>

          {selected ? (
            <div className="pilot-flow">
              <article>
                <div className="pilot-card-heading">
                  <span>CHATGPT</span>
                  <strong>{statusLabels[selected.status]}</strong>
                </div>
                <div className="pilot-metadata">
                  <p>
                    <span>URL identity</span>
                    <code>{destinationUrl(selected)}</code>
                  </p>
                  <p>
                    <span>Conversation</span>
                    <code>
                      {selected.chatGptInspection?.conversationId ?? selected.destination.mode}
                    </code>
                  </p>
                  <p>
                    <span>Composer</span>
                    <b>{selected.chatGptInspection?.hasDraft ? 'Có draft - bị chặn' : 'Trống'}</b>
                  </p>
                  <p>
                    <span>Streaming</span>
                    <b>{selected.chatGptInspection?.streaming ? 'Có' : 'Không'}</b>
                  </p>
                </div>
                <div className="pilot-actions">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void run(
                        () => window.contextBridgeDesktop.inspectPilotChatGpt(selected.id),
                        'Đã kiểm tra trang ChatGPT và composer.',
                      )
                    }
                  >
                    Kiểm tra ChatGPT
                  </button>
                  <button
                    type="button"
                    disabled={busy || selected.status !== 'draft'}
                    onClick={() =>
                      void run(
                        () => window.contextBridgeDesktop.preparePilotChatGpt(selected.id),
                        'Handoff đã được tạo để xem trước; chưa gửi.',
                      )
                    }
                  >
                    Chuẩn bị ChatGPT handoff
                  </button>
                </div>
                <div
                  className="pilot-notes-editor pilot-notes-existing"
                  aria-label="Ghi chú pilot đang chọn"
                >
                  <div className="pilot-card-heading">
                    <div>
                      <span>OPERATOR NOTES</span>
                      <strong>Ghi chú cho phiên này</strong>
                    </div>
                    <small>Đã dùng một lần sẽ được giữ trong lịch sử nhưng không gửi lại.</small>
                  </div>
                  <div className="pilot-note-list">
                    {selectedNotes.length === 0 && (
                      <p className="pilot-empty">Chưa có ghi chú bổ sung.</p>
                    )}
                    {selectedNotes.map((note) => (
                      <div className="pilot-note-row" key={note.id}>
                        <span>
                          {noteTargetLabel(note.target)} ·{' '}
                          {note.mode === 'repeat' ? 'lặp lại' : 'một lần'}
                          {note.consumedAt ? ' · đã dùng' : ' · chờ dùng'}
                        </span>
                        <strong>{note.text}</strong>
                        <button
                          type="button"
                          aria-label={`Xóa ghi chú ${note.id}`}
                          disabled={busy}
                          onClick={() =>
                            void run(
                              () =>
                                window.contextBridgeDesktop.updatePilotNotes({
                                  pilotId: selected.id,
                                  notes: selectedNotes
                                    .filter((candidate) => candidate.id !== note.id)
                                    .map(({ id, target, mode, text }) => ({
                                      id,
                                      target,
                                      mode,
                                      text,
                                    })),
                                }),
                              'Đã xóa ghi chú khỏi pilot đang chọn.',
                            )
                          }
                        >
                          Xóa
                        </button>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    disabled={busy || !noteText.trim()}
                    onClick={() => void addNoteToSelected()}
                  >
                    Thêm ghi chú vào pilot đang chọn
                  </button>
                </div>
                <div className="pilot-archive" aria-label="Lưu trữ lịch sử ChatGPT">
                  <div className="pilot-card-heading">
                    <span>LỊCH SỬ</span>
                    <strong>
                      {selected.destination.mode === 'existing'
                        ? 'Tự động lưu mỗi 30 giây'
                        : 'Cần conversation hiện có'}
                    </strong>
                  </div>
                  <div className="pilot-metadata">
                    <p>
                      <span>Phiên bản đã lưu</span>
                      <b>{selected.chatArchive?.revisionCount ?? 0}</b>
                    </p>
                    <p>
                      <span>Tin nhắn mới nhất</span>
                      <b>{selected.chatArchive?.latestMessageCount ?? 0}</b>
                    </p>
                    <p>
                      <span>Đồng bộ gần nhất</span>
                      <b>
                        {selected.chatArchive
                          ? new Date(selected.chatArchive.lastSyncedAt).toLocaleString('vi-VN')
                          : 'Chưa đồng bộ'}
                      </b>
                    </p>
                    <p>
                      <span>Snapshot hash</span>
                      <code>{shortHash(selected.chatArchive?.latestContentHash)}</code>
                    </p>
                  </div>
                  {selectedMessages.length > 0 && (
                    <div className="pilot-chat-selection" aria-label="Chọn tin nhắn làm ngữ cảnh">
                      <div className="pilot-card-heading">
                        <div>
                          <span>CONTEXT PICKER</span>
                          <strong>Chọn đoạn cần đưa vào handoff</strong>
                        </div>
                        <small>
                          Chỉ các dòng được tick mới đi vào preview; archive đầy đủ vẫn được lưu
                          riêng.
                        </small>
                      </div>
                      <div className="pilot-selection-actions">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            void updateChatSelection(
                              selectedMessages.map((message) => message.ordinal),
                            )
                          }
                        >
                          Chọn tất cả
                        </button>
                        <button
                          type="button"
                          disabled={busy || !selected.chatSelection?.ordinals.length}
                          onClick={() => void updateChatSelection([])}
                        >
                          Bỏ chọn
                        </button>
                      </div>
                      <div className="pilot-selection-list">
                        {selectedMessages.slice(0, messageLimit).map((message) => {
                          const checked =
                            selected.chatSelection?.ordinals.includes(message.ordinal) ?? false;
                          return (
                            <label key={`${String(message.ordinal)}-${message.role}`}>
                              <input
                                type="checkbox"
                                checked={checked}
                                disabled={busy}
                                onChange={() => {
                                  const current = new Set(selected.chatSelection?.ordinals ?? []);
                                  if (checked) current.delete(message.ordinal);
                                  else current.add(message.ordinal);
                                  void updateChatSelection([...current]);
                                }}
                              />
                              <span>
                                <strong>
                                  {String(message.ordinal + 1)} · {message.role}
                                </strong>
                                <small>{message.text}</small>
                              </span>
                            </label>
                          );
                        })}
                        {selectedMessages.length > messageLimit && (
                          <button
                            className="show-more"
                            type="button"
                            onClick={() => setMessageLimit((current) => current + 5)}
                          >
                            Hiện thêm 5 tin nhắn
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                  <div className="pilot-actions">
                    <button
                      type="button"
                      disabled={busy || selected.destination.mode !== 'existing'}
                      onClick={() =>
                        void run(
                          () => window.contextBridgeDesktop.syncPilotChatHistory(selected.id),
                          'Đã đồng bộ toàn bộ nội dung được render của conversation vào SQLite.',
                        )
                      }
                    >
                      Đồng bộ lịch sử ngay
                    </button>
                    <button type="button" disabled={busy} onClick={() => void exportHistory()}>
                      Xuất toàn bộ lịch sử (.json)
                    </button>
                  </div>
                  <div className="pilot-account-switch">
                    <div>
                      <span>ACCOUNT SWITCH TRANSFER</span>
                      <strong>Đổi account mà không mất liên kết dự án</strong>
                      <small>
                        Dùng lịch sử đã lưu cục bộ, tạo chat mới, xác nhận đúng một lần rồi gắn
                        conversation mới vào cùng project và Codex target.
                      </small>
                    </div>
                    <button
                      className="pilot-transfer-primary"
                      type="button"
                      disabled={busy || !selected.chatArchive}
                      onClick={() => void prepareAccountTransfer()}
                    >
                      Chuyển sang account hiện tại
                    </button>
                  </div>
                </div>
                {selected.accountTransfer && (
                  <div
                    className="pilot-transfer"
                    aria-label="Chuyển lịch sử sang account ChatGPT mới"
                  >
                    <div className="pilot-card-heading">
                      <span>ACCOUNT TRANSFER</span>
                      <strong>{accountTransferLabels[selected.accountTransfer.status]}</strong>
                    </div>
                    <ol className="pilot-transfer-steps">
                      <li className="done">Đóng gói lịch sử cũ</li>
                      <li
                        className={
                          selected.accountTransfer.status === 'manual_attachment_required'
                            ? 'blocked'
                            : 'done'
                        }
                      >
                        Tạo chat mới trong account hiện tại
                      </li>
                      <li
                        className={
                          ['dispatching', 'confirmation_required', 'completed'].includes(
                            selected.accountTransfer.status,
                          )
                            ? 'done'
                            : ''
                        }
                      >
                        Gửi dữ liệu sau xác nhận
                      </li>
                      <li className={selected.accountTransfer.status === 'completed' ? 'done' : ''}>
                        Liên kết lại với project Codex
                      </li>
                    </ol>
                    <div className="pilot-metadata">
                      <p>
                        <span>ZIP lịch sử</span>
                        <code>{selected.accountTransfer.artifact.zipPath}</code>
                      </p>
                      <p>
                        <span>Cuộc chat / phiên bản</span>
                        <b>
                          {selected.accountTransfer.artifact.conversationCount} /{' '}
                          {selected.accountTransfer.artifact.revisionCount}
                        </b>
                      </p>
                      <p>
                        <span>SHA-256</span>
                        <code>{shortHash(selected.accountTransfer.artifact.sha256)}</code>
                      </p>
                      <p>
                        <span>Đích mới</span>
                        <code>
                          {selected.accountTransfer.targetDestination.mode === 'existing'
                            ? (selected.accountTransfer.targetDestination.conversationPath ??
                              selected.accountTransfer.targetDestination.conversationId)
                            : 'ChatGPT new chat'}
                        </code>
                      </p>
                    </div>
                    <div className="pilot-actions">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void run(
                            () =>
                              window.contextBridgeDesktop.revealPilotAccountTransfer(selected.id),
                            'Đã mở vị trí ZIP chuyển account để kiểm tra.',
                          )
                        }
                      >
                        Mở vị trí ZIP
                      </button>
                      {selected.accountTransfer.status === 'confirmation_required' && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            void run(
                              () =>
                                window.contextBridgeDesktop.capturePilotAccountTransfer(
                                  selected.id,
                                ),
                              'Đã kiểm tra tin nhắn và conversation mới; không gửi lặp lại.',
                            )
                          }
                        >
                          Kiểm tra gửi và liên kết lại
                        </button>
                      )}
                    </div>
                    {selected.accountTransfer.status === 'manual_attachment_required' && (
                      <p className="pilot-empty">
                        Gói lịch sử vượt giới hạn composer an toàn. App đã tạo ZIP đầy đủ nhưng chưa
                        tự upload; hãy mở ZIP và đính kèm thủ công sau khi kiểm tra.
                      </p>
                    )}
                    {selected.accountTransfer.preview && (
                      <div className="pilot-preview">
                        <p>
                          <span>Payload hash</span>
                          <code>{shortHash(selected.accountTransfer.preview.textHash)}</code>
                        </p>
                        <pre>{selected.accountTransfer.preview.text}</pre>
                        <button
                          className="pilot-approve"
                          type="button"
                          disabled={busy || selected.accountTransfer.status !== 'review_required'}
                          onClick={() =>
                            void run(
                              () =>
                                window.contextBridgeDesktop.approvePilotAccountTransfer(
                                  selected.id,
                                ),
                              'Đã dùng xác nhận một lần để gửi gói khôi phục vào chat mới.',
                            )
                          }
                        >
                          Xác nhận và gửi sang chat mới
                        </button>
                      </div>
                    )}
                  </div>
                )}
                {selected.chatGptPreview && (
                  <div className="pilot-preview">
                    <p>
                      <span>Payload hash</span>
                      <code>{shortHash(selected.chatGptPreview.textHash)}</code>
                    </p>
                    <p>
                      <span>Handoff</span>
                      <code>{selected.chatGptPreview.handoffId}</code>
                    </p>
                    <p>
                      <span>Correlation</span>
                      <code>{selected.chatGptPreview.correlationId}</code>
                    </p>
                    <pre>{selected.chatGptPreview.text}</pre>
                    <button
                      className="pilot-approve"
                      type="button"
                      disabled={busy || selected.status !== 'chatgpt_ready'}
                      onClick={() =>
                        void run(
                          () => window.contextBridgeDesktop.approvePilotChatGpt(selected.id),
                          'Explicit approval đã được dùng một lần để insert và submit ChatGPT.',
                        )
                      }
                    >
                      Duyệt và gửi ChatGPT
                    </button>
                  </div>
                )}
              </article>

              <article>
                <div className="pilot-card-heading">
                  <span>CODEX</span>
                  <strong>workspace_write_no_network</strong>
                </div>
                {selected.response && (
                  <div className="pilot-response">
                    <strong>Structured response hợp lệ</strong>
                    <p>{selected.response.analysisSummary}</p>
                  </div>
                )}
                {selected.codexPreview ? (
                  <div className="pilot-preview">
                    <p>
                      <span>Prompt hash</span>
                      <code>{shortHash(selected.codexPreview.promptHash)}</code>
                    </p>
                    <p>
                      <span>Repository</span>
                      <code>{selected.repositoryRoot}</code>
                    </p>
                    <p>
                      <span>Sandbox</span>
                      <code>workspace-write / network disabled / approval never</code>
                    </p>
                    <pre>{selected.codexPreview.codexPrompt}</pre>
                    <button
                      className="pilot-approve"
                      type="button"
                      disabled={busy || selected.status !== 'codex_ready'}
                      onClick={() =>
                        void run(
                          () => window.contextBridgeDesktop.approvePilotCodex(selected.id),
                          'Codex đã được dispatch tới đúng repository sau explicit approval.',
                        )
                      }
                    >
                      Duyệt và gửi Codex
                    </button>
                  </div>
                ) : (
                  <p className="pilot-empty">
                    Codex prompt chỉ xuất hiện sau khi response ChatGPT được xác thực.
                  </p>
                )}
                {selected.codexRunId && (
                  <div className="pilot-result">
                    <p>
                      <span>Run ID</span>
                      <code>{selected.codexRunId}</code>
                    </p>
                    <p>
                      <span>Thread ID</span>
                      <code>{selected.codexThreadId}</code>
                    </p>
                    <p>
                      <span>Final response</span>
                      <strong>{selected.finalResponse ?? 'Đang chờ…'}</strong>
                    </p>
                    {selected.codexBundle && (
                      <div className="pilot-bundle">
                        <p>
                          <span>ZIP an toàn</span>
                          <code>{selected.codexBundle.zipPath}</code>
                        </p>
                        <p>
                          <span>File thay đổi / đã đóng gói</span>
                          <b>
                            {selected.codexBundle.changedFiles.length} /{' '}
                            {selected.codexBundle.includedFiles.length}
                          </b>
                        </p>
                        <p>
                          <span>File bị chặn</span>
                          <b>{selected.codexBundle.blockedFiles.length}</b>
                        </p>
                        <p>
                          <span>SHA-256</span>
                          <code>{shortHash(selected.codexBundle.sha256)}</code>
                        </p>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            void run(
                              () => window.contextBridgeDesktop.revealPilotCodexBundle(selected.id),
                              'Đã mở vị trí ZIP để bạn kiểm tra và đính kèm vào ChatGPT.',
                            )
                          }
                        >
                          Mở vị trí ZIP
                        </button>
                      </div>
                    )}
                    {selected.codexBundleErrorCode && (
                      <p className="pilot-empty">
                        Không thể tạo ZIP: {selected.codexBundleErrorCode}
                      </p>
                    )}
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void run(
                          () => window.contextBridgeDesktop.refreshPilot(selected.id),
                          'Đã làm mới trạng thái Codex từ main process.',
                        )
                      }
                    >
                      Làm mới Codex
                    </button>
                  </div>
                )}
                {selected.status === 'codex_completed' && (
                  <div className="pilot-website">
                    <div className="pilot-card-heading">
                      <span>RESULT</span>
                      <strong>
                        {selected.websiteVerification?.status === 'passed'
                          ? 'Website hợp lệ'
                          : 'Chưa xác minh'}
                      </strong>
                    </div>
                    <div className="pilot-actions">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void run(
                            () => window.contextBridgeDesktop.verifyPilotWebsite(selected.id),
                            'Đã xác minh website cục bộ, không dùng network.',
                          )
                        }
                      >
                        Xác minh website
                      </button>
                      <button
                        type="button"
                        disabled={busy || selected.websiteVerification?.status !== 'passed'}
                        onClick={() =>
                          void run(
                            () => window.contextBridgeDesktop.openPilotPreview(selected.id),
                            'Đã mở preview sandboxed với JavaScript và navigation ngoài bị chặn.',
                          )
                        }
                      >
                        Mở preview
                      </button>
                    </div>
                    {selected.websiteVerification && (
                      <ul className="pilot-checks">
                        {selected.websiteVerification.checks.map((check) => (
                          <li className={check.passed ? 'passed' : 'failed'} key={check.name}>
                            <span>{check.passed ? 'PASS' : 'FAIL'}</span>
                            <strong>{check.name}</strong>
                            <small>{check.detail}</small>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </article>
            </div>
          ) : (
            <p className="pilot-empty">Tạo pilot để bắt đầu. Không có thao tác gửi nền.</p>
          )}
        </div>
      </div>
    </section>
  );
}
