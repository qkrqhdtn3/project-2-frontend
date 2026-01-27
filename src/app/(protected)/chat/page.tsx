"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Client } from "@stomp/stompjs";
import SockJS from "sockjs-client";
import { useSearchParams } from "next/navigation";
import { apiRequest, buildApiUrl } from "@/lib/api";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { SkeletonLine } from "@/components/ui/SkeletonLine";

type ChatDto = {
  id?: number;
  itemId: number;
  roomId: string;
  sender?: string;
  senderId?: number;
  message: string;
  imageUrls?: string[];
  createDate: string;
  isRead: boolean;
};

type ChatListItem = {
  roomId: string;
  itemId: number;
  opponentNickname?: string;
  opponentProfileImageUrl?: string;
  lastMessage?: string;
  lastMessageDate?: string;
  unreadCount?: number;
  itemName?: string;
  itemImageUrl?: string;
  itemPrice?: number;
  txType?: "AUCTION" | "POST";
};

type RoomSummary = {
  roomId: string;
  itemId: number;
  opponentNickname?: string;
  opponentProfileImageUrl?: string;
  lastMessage?: string;
  lastMessageAt?: string;
  unreadCount?: number;
  itemName?: string;
  itemImageUrl?: string;
  itemPrice?: number;
  txType?: "AUCTION" | "POST";
};

const toTimestamp = (value?: string) =>
  value ? new Date(value).getTime() : 0;

const resolveImageUrl = (url: string) => {
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }
  return buildApiUrl(url);
};

export default function ChatPage() {
  const searchParams = useSearchParams();
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatDto[]>([]);
  const [messageText, setMessageText] = useState("");
  const [pendingImages, setPendingImages] = useState<File[]>([]);
  const [isRoomsLoading, setIsRoomsLoading] = useState(false);
  const [isMessagesLoading, setIsMessagesLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [roomsError, setRoomsError] = useState<string | null>(null);
  const [messagesError, setMessagesError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [messagesRefreshTick, setMessagesRefreshTick] = useState(0);
  const [selectedImagesError, setSelectedImagesError] = useState<string | null>(
    null
  );
  const lastChatIdRef = useRef<number | null>(null);
  const [isOlderLoading, setIsOlderLoading] = useState(false);
  const [hasMoreMessages, setHasMoreMessages] = useState(true);

  const pendingRoomId = searchParams?.get("roomId");
  const pendingItemId = searchParams?.get("itemId");

  const selectedRoom = useMemo(
    () => rooms.find((room) => room.roomId === selectedRoomId) || null,
    [rooms, selectedRoomId]
  );

  useEffect(() => {
    if (pendingRoomId && !selectedRoomId) {
      setSelectedRoomId(pendingRoomId);
    }
  }, [pendingRoomId, selectedRoomId]);

  useEffect(() => {
    let isMounted = true;
    const fetchRooms = async () => {
      setIsRoomsLoading(true);
      setRoomsError(null);
      try {
        const { rsData, errorMessage, response } =
          await apiRequest<ChatListItem[]>("/api/v1/chat/list");
        if (!response.ok) {
          setRoomsError("채팅 목록을 불러오지 못했습니다.");
          return;
        }
        if (!rsData) {
          setRoomsError(errorMessage || "응답 파싱에 실패했습니다.");
          return;
        }
        if (!isMounted) return;
        const roomItems = rsData.data || [];
        const mappedRooms = roomItems.map((room) => ({
          roomId: room.roomId,
          itemId: room.itemId,
          opponentNickname: room.opponentNickname,
          opponentProfileImageUrl: room.opponentProfileImageUrl,
          lastMessage: room.lastMessage,
          lastMessageAt: room.lastMessageDate,
          unreadCount: room.unreadCount,
          itemName: room.itemName,
          itemImageUrl: room.itemImageUrl,
          itemPrice: room.itemPrice,
          txType: room.txType,
        }));
        const sortedRooms = [...mappedRooms].sort(
          (a, b) => toTimestamp(b.lastMessageAt) - toTimestamp(a.lastMessageAt)
        );
        if (
          pendingRoomId &&
          !sortedRooms.some((room) => room.roomId === pendingRoomId)
        ) {
          const parsedItemId = pendingItemId ? Number(pendingItemId) : 0;
          const itemId = Number.isFinite(parsedItemId) ? parsedItemId : 0;
          setRooms([
            {
              roomId: pendingRoomId,
              itemId,
              lastMessage: "새 채팅방",
              lastMessageAt: "",
              unreadCount: 0,
            },
            ...sortedRooms,
          ]);
        } else {
          setRooms(sortedRooms);
        }
      } catch {
        if (isMounted) {
          setRoomsError("네트워크 오류가 발생했습니다.");
        }
      } finally {
        if (isMounted) {
          setIsRoomsLoading(false);
        }
      }
    };
    fetchRooms();
    return () => {
      isMounted = false;
    };
  }, [pendingRoomId, pendingItemId]);

  useEffect(() => {
    if (!selectedRoomId) {
      setMessages([]);
      return;
    }
    setMessageText("");
    setPendingImages([]);
    setSelectedImagesError(null);
    setSendError(null);
    let isMounted = true;
    const fetchMessages = async () => {
      setIsMessagesLoading(true);
      setMessagesError(null);
      setHasMoreMessages(true);
      try {
        const { rsData, errorMessage, response } =
          await apiRequest<ChatDto[]>(`/api/v1/chat/room/${selectedRoomId}`);
        if (!response.ok) {
          setMessagesError("메시지를 불러오지 못했습니다.");
          return;
        }
        if (!rsData) {
          setMessagesError(errorMessage || "응답 파싱에 실패했습니다.");
          return;
        }
        if (!isMounted) return;
        const nextMessages = rsData.data || [];
        setMessages(nextMessages);
        const oldest = nextMessages[0]?.id ?? null;
        lastChatIdRef.current = typeof oldest === "number" ? oldest : null;
        setHasMoreMessages(nextMessages.length > 0);
      } catch {
        if (isMounted) {
          setMessagesError("네트워크 오류가 발생했습니다.");
        }
      } finally {
        if (isMounted) {
          setIsMessagesLoading(false);
        }
      }
    };
    fetchMessages();
    return () => {
      isMounted = false;
    };
  }, [selectedRoomId, messagesRefreshTick]);

  const handleSend = async () => {
    if (
      !selectedRoomId ||
      (!messageText.trim() && !pendingImages.length) ||
      isSending
    ) {
      return;
    }
    setIsSending(true);
    setSendError(null);
    try {
      const formData = new FormData();
      formData.append("roomId", selectedRoomId);
      if (messageText.trim()) {
        formData.append("message", messageText.trim());
      }
      pendingImages.forEach((file) => {
        formData.append("images", file);
      });
      const response = await fetch(buildApiUrl("/api/v1/chat/send"), {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      if (!response.ok) {
        const raw = await response.text();
        let serverMessage = "";
        if (raw) {
          try {
            const parsed = JSON.parse(raw) as { msg?: string; message?: string };
            serverMessage = parsed.msg || parsed.message || "";
          } catch {
            serverMessage = raw.trim();
          }
        }
        setSendError(serverMessage || "메시지 전송에 실패했습니다.");
        return;
      }
      setMessageText("");
      setPendingImages([]);
    } catch {
      setSendError("네트워크 오류가 발생했습니다.");
    } finally {
      setIsSending(false);
    }
  };

  const handleLoadOlder = async () => {
    if (!selectedRoomId || isOlderLoading || !hasMoreMessages) return;
    const lastChatId = lastChatIdRef.current;
    setIsOlderLoading(true);
    setMessagesError(null);
    try {
      const params = new URLSearchParams();
      if (lastChatId) {
        params.set("lastChatId", String(lastChatId));
      }
      const { rsData, errorMessage, response } =
        await apiRequest<ChatDto[]>(
          `/api/v1/chat/room/${selectedRoomId}?${params.toString()}`
        );
      if (!response.ok || !rsData) {
        setMessagesError(errorMessage || "메시지를 불러오지 못했습니다.");
        return;
      }
      const older = rsData.data || [];
      if (older.length === 0) {
        setHasMoreMessages(false);
        return;
      }
      setMessages((prev) => [...older, ...prev]);
      const oldest = older[0]?.id ?? null;
      lastChatIdRef.current = typeof oldest === "number" ? oldest : null;
    } catch {
      setMessagesError("네트워크 오류가 발생했습니다.");
    } finally {
      setIsOlderLoading(false);
    }
  };

  useEffect(() => {
    if (!selectedRoomId) return;
    if (typeof window === "undefined") return;
    const accessToken = localStorage.getItem("wsAccessToken");
    if (!accessToken) return;

    const client = new Client({
      webSocketFactory: () => new SockJS(buildApiUrl("/ws")),
      connectHeaders: {
        Authorization: `Bearer ${accessToken}`,
      },
      reconnectDelay: 5000,
      onConnect: () => {
        client.subscribe(`/sub/v1/chat/room/${selectedRoomId}`, (message) => {
          if (!message.body) return;
          try {
            const data = JSON.parse(message.body) as ChatDto;
            if (!data || !data.roomId) return;
            if (data.roomId !== selectedRoomId) return;
            setMessages((prev) => {
              if (prev.some((msg) => msg.id === data.id)) {
                return prev;
              }
              return [...prev, data];
            });
            setRooms((prev) => {
              const next = prev.map((room) =>
                room.roomId === data.roomId
                  ? {
                      ...room,
                      lastMessage: data.message,
                      lastMessageAt: data.createDate,
                      unreadCount: 0,
                    }
                  : room
              );
              return next.sort(
                (a, b) => toTimestamp(b.lastMessageAt) - toTimestamp(a.lastMessageAt)
              );
            });
          } catch {
            // ignore malformed messages
          }
        });
      },
    });

    client.activate();
    return () => {
      client.deactivate();
    };
  }, [selectedRoomId]);

  return (
    <div className="page">
      <div className="split">
        <Card>
          <h2 style={{ marginTop: 0 }}>채팅 목록</h2>
          {isRoomsLoading ? (
            <>
              <SkeletonLine width="70%" />
              <SkeletonLine width="90%" style={{ marginTop: 12 }} />
            </>
          ) : roomsError ? (
            <ErrorMessage message={roomsError} />
          ) : rooms.length === 0 ? (
            <EmptyState message="채팅방이 없습니다." />
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              {rooms.map((room) => (
                <button
                  key={room.roomId}
                  className="card"
                  style={{
                    textAlign: "left",
                    border:
                      selectedRoomId === room.roomId
                        ? "2px solid var(--accent)"
                        : "1px solid var(--border)",
                  }}
                  onClick={() => setSelectedRoomId(room.roomId)}
                >
                  <div className="muted">
                    {room.opponentNickname
                      ? `상대: ${room.opponentNickname}`
                      : "상대 정보 없음"}
                  </div>
                  <div style={{ marginTop: 6 }}>
                    {room.lastMessage || "마지막 메시지 없음"}
                  </div>
                  <div className="muted" style={{ marginTop: 6 }}>
                    {room.lastMessageAt || "시간 정보 없음"}
                  </div>
                  <div className="muted" style={{ marginTop: 6 }}>
                    방 ID: {room.roomId}
                  </div>
                  {room.unreadCount ? (
                    <div className="tag" style={{ marginTop: 8 }}>
                      미확인 {room.unreadCount}
                    </div>
                  ) : null}
                </button>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <h2 style={{ marginTop: 0 }}>메시지</h2>
          {!selectedRoomId ? (
            <EmptyState message="채팅방을 선택하세요." />
          ) : isMessagesLoading ? (
            <>
              <SkeletonLine width="70%" />
              <SkeletonLine width="90%" style={{ marginTop: 12 }} />
            </>
          ) : messagesError ? (
            <ErrorMessage message={messagesError} />
          ) : messages.length === 0 ? (
            <EmptyState message="메시지가 없습니다." />
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              {messages.map((message, index) => (
                <div key={`${message.id ?? index}-${message.createDate}`}>
                  <div className="muted">
                    {(message.sender ||
                      (message.senderId !== undefined
                        ? `#${message.senderId}`
                        : "알 수 없음"))}{" "}
                    · {message.createDate}
                  </div>
                  <div>{message.message}</div>
                  {message.imageUrls && message.imageUrls.length > 0 ? (
                    <div className="grid-2" style={{ marginTop: 8 }}>
                      {message.imageUrls.map((url, imgIndex) => (
                        <img
                          key={`${url}-${imgIndex}`}
                          src={resolveImageUrl(url)}
                          alt={`채팅 이미지 ${imgIndex + 1}`}
                          style={{ width: "100%", borderRadius: 8 }}
                        />
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
          {selectedRoomId ? (
            <div style={{ marginTop: 16 }}>
              <div className="field">
                <label className="label" htmlFor="messageText">
                  메시지 입력
                </label>
                <textarea
                  id="messageText"
                  className="textarea"
                  rows={3}
                  value={messageText}
                  onChange={(event) => setMessageText(event.target.value)}
                  placeholder="메시지를 입력하세요"
                />
              </div>
              <div className="field" style={{ marginTop: 12 }}>
                <label className="label" htmlFor="messageImages">
                  이미지 첨부
                </label>
                <input
                  id="messageImages"
                  className="input"
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(event) => {
                    const files = Array.from(event.target.files || []);
                    if (files.length > 10) {
                      setSelectedImagesError("이미지는 최대 10장까지 가능합니다.");
                      setPendingImages(files.slice(0, 10));
                      return;
                    }
                    setSelectedImagesError(null);
                    setPendingImages(files);
                  }}
                />
                {pendingImages.length > 0 ? (
                  <div className="muted" style={{ marginTop: 6 }}>
                    선택됨: {pendingImages.length}개
                  </div>
                ) : null}
                {selectedImagesError ? (
                  <ErrorMessage
                    message={selectedImagesError}
                    style={{ marginTop: 8 }}
                  />
                ) : null}
              </div>
              {sendError ? (
                <ErrorMessage message={sendError} style={{ marginTop: 8 }} />
              ) : null}
              <div className="actions" style={{ marginTop: 12 }}>
                <button
                  className="btn btn-primary"
                  onClick={handleSend}
                  disabled={
                    isSending || (!messageText.trim() && !pendingImages.length)
                  }
                >
                  {isSending ? "전송 중..." : "전송"}
                </button>
                <button
                  className="btn btn-ghost"
                  onClick={() => setMessagesRefreshTick((prev) => prev + 1)}
                >
                  새로고침
                </button>
                <button
                  className="btn btn-ghost"
                  onClick={handleLoadOlder}
                  disabled={isOlderLoading || !hasMoreMessages}
                >
                  {isOlderLoading ? "불러오는 중..." : "이전 메시지"}
                </button>
              </div>
            </div>
          ) : null}
        </Card>
      </div>
    </div>
  );
}






