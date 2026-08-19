package com.example.stomp.model;

public class ChatMessage {
    private String id;
    private String sender;
    private String content;
    private String type; // CHAT, JOIN, LEAVE, ECHO, REPLAY
    private long timestamp;

    public ChatMessage() {
    }

    public ChatMessage(String id, String sender, String content, String type, long timestamp) {
        this.id = id;
        this.sender = sender;
        this.content = content;
        this.type = type;
        this.timestamp = timestamp;
    }

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getSender() {
        return sender;
    }

    public void setSender(String sender) {
        this.sender = sender;
    }

    public String getContent() {
        return content;
    }

    public void setContent(String content) {
        this.content = content;
    }

    public String getType() {
        return type;
    }

    public void setType(String type) {
        this.type = type;
    }

    public long getTimestamp() {
        return timestamp;
    }

    public void setTimestamp(long timestamp) {
        this.timestamp = timestamp;
    }
}
