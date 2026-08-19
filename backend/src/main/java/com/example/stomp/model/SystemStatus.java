package com.example.stomp.model;

public class SystemStatus {
    private String status;
    private long uptimeSeconds;
    private int tickCount;
    private String timestamp;

    public SystemStatus() {
    }

    public SystemStatus(String status, long uptimeSeconds, int tickCount, String timestamp) {
        this.status = status;
        this.uptimeSeconds = uptimeSeconds;
        this.tickCount = tickCount;
        this.timestamp = timestamp;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public long getUptimeSeconds() {
        return uptimeSeconds;
    }

    public void setUptimeSeconds(long uptimeSeconds) {
        this.uptimeSeconds = uptimeSeconds;
    }

    public int getTickCount() {
        return tickCount;
    }

    public void setTickCount(int tickCount) {
        this.tickCount = tickCount;
    }

    public String getTimestamp() {
        return timestamp;
    }

    public void setTimestamp(String timestamp) {
        this.timestamp = timestamp;
    }
}
