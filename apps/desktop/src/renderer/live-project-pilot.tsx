import { useEffect, useMemo, useRef, useState } from 'react';
import type { PilotView, PilotViewResponse } from '../pilot-contracts';
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

function shortHash(value: string | undefined): string {
  return value ? `${value.slice(0, 12)}…${value.slice(-8)}` : 'Chưa có';
}

function errorText(response: PilotViewResponse): string {
  if (response.ok) return '';
  if (response.error.code === 'CHATGPT_CONVERSATION_UNAVAILABLE') {
    return 'Cuộc chat không khả dụng trong tài khoản/workspace hiện tại. Hãy mở đúng conversation trong Edge rồi nhấn "Kiểm tra ChatGPT"; nếu vẫn lỗi, tạo pilot mới với "Conversation đang mở".';
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
  const [repositoryId, setRepositoryId] = useState(repositories[0]?.id ?? '');
  const [objective, setObjective] = useState('');
  const [destinationMode, setDestinationMode] = useState<'current' | 'new' | 'existing'>('new');
  const [conversationId, setConversationId] = useState('');
  const [transport, setTransport] = useState('Chưa kiểm tra');
  const [notice, setNotice] = useState('Chưa có dữ liệu nào được gửi.');
  const [busy, setBusy] = useState(false);
  const archiveSyncing = useRef(false);

  const selected = useMemo(
    () => items.find((item) => item.id === selectedId) ?? items[0],
    [items, selectedId],
  );
  const selectedRepository = repositories.find((item) => item.id === repositoryId);

  const replace = (view: PilotView): void => {
    setItems((current) => [view, ...current.filter((item) => item.id !== view.id)]);
    setSelectedId(view.id);
  };

  const load = async (): Promise<void> => {
    const [pilots, health] = await Promise.all([
      window.contextBridgeDesktop.listPilots(projectId),
      window.contextBridgeDesktop.getTransportStatus(),
    ]);
    if (pilots.ok) {
      setItems(pilots.value);
      setSelectedId((current) =>
        pilots.value.some((item) => item.id === current) ? current : (pilots.value[0]?.id ?? ''),
      );
    } else {
      setNotice(`${pilots.error.code}: ${pilots.error.message}`);
    }
    setTransport(
      health.ok
        ? `${health.value.state} / nativeMessaging ${health.value.permissionActive ? 'active' : 'inactive'}`
        : `${health.error.code}: unavailable`,
    );
  };

  useEffect(() => {
    setRepositoryId(repositories[0]?.id ?? '');
    void load();
  }, [projectId, repositories[0]?.id]);

  useEffect(() => {
    if (!selected || !['chatgpt_dispatched', 'codex_running'].includes(selected.status)) return;
    const timer = window.setInterval(() => {
      void (async () => {
        const response =
          selected.status === 'chatgpt_dispatched'
            ? await window.contextBridgeDesktop.capturePilotChatGpt(selected.id)
            : await window.contextBridgeDesktop.refreshPilot(selected.id);
        if (response.ok) {
          replace(response.value);
          setNotice(
            response.value.status === 'codex_ready'
              ? 'Structured response đã được xác thực. Hãy duyệt Codex prompt.'
              : response.value.status === 'codex_completed'
                ? 'Codex đã hoàn tất. Kết quả đã được lưu để khôi phục sau restart.'
                : 'Đang chờ tiến trình hoàn tất.',
          );
        } else if (
          !['CHATGPT_NOT_READY', 'CHATGPT_CONFIRMATION_REQUIRED'].includes(response.error.code)
        ) {
          setNotice(errorText(response));
        }
      })();
    }, 2_000);
    return () => window.clearInterval(timer);
  }, [selected?.id, selected?.status]);

  useEffect(() => {
    if (selected?.destination.mode !== 'existing') return;
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
  }, [selected?.id, selected?.destination.mode]);

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

  const create = async (): Promise<void> => {
    if (!repositoryId || !objective.trim()) return;
    await run(
      () =>
        window.contextBridgeDesktop.createPilot({
          projectId,
          repositoryId,
          objective,
          destination:
            destinationMode === 'current'
              ? { mode: 'current' }
              : destinationMode === 'existing'
                ? { mode: 'existing', conversationId: conversationId.trim() }
                : { mode: 'new' },
        }),
      'Pilot đã được tạo trong SQLite. Chưa gửi ChatGPT hoặc Codex.',
    );
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
              <dd>{projectName}</dd>
            </div>
            <div>
              <dt>Repository</dt>
              <dd>{selectedRepository?.branch ?? 'branch chưa ghi nhận'}</dd>
            </div>
          </dl>
          <label className="pilot-field">
            <span>Repository đích</span>
            <select
              aria-label="Repository đích cho Live Project Pilot"
              value={repositoryId}
              onChange={(event) => setRepositoryId(event.target.value)}
            >
              {repositories.map((repository) => (
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
          <fieldset className="pilot-destination">
            <legend>ChatGPT destination</legend>
            <label>
              <input
                aria-label="Dùng conversation ChatGPT đang mở"
                type="radio"
                name="pilot-destination"
                checked={destinationMode === 'current'}
                onChange={() => setDestinationMode('current')}
              />
              Conversation đang mở
            </label>
            <label>
              <input
                type="radio"
                name="pilot-destination"
                checked={destinationMode === 'new'}
                onChange={() => setDestinationMode('new')}
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
                onChange={(event) => setConversationId(event.target.value)}
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
              <button
                type="button"
                className={item.id === selected?.id ? 'active' : ''}
                key={item.id}
                onClick={() => setSelectedId(item.id)}
              >
                <span>{statusLabels[item.status]}</span>
                <small>{item.id.slice(0, 8)}</small>
              </button>
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
                </div>
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
