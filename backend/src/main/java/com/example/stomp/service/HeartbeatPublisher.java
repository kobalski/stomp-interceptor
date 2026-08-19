package com.example.stomp.service;

import com.example.stomp.model.SystemStatus;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.concurrent.atomic.AtomicInteger;

@Service
public class HeartbeatPublisher {

    private static final Logger log = LoggerFactory.getLogger(HeartbeatPublisher.class);
    private final SimpMessagingTemplate messagingTemplate;
    private final long startTime = System.currentTimeMillis();
    private final AtomicInteger tickCount = new AtomicInteger(0);

    public HeartbeatPublisher(SimpMessagingTemplate messagingTemplate) {
        this.messagingTemplate = messagingTemplate;
    }

    @Scheduled(fixedRate = 12000)
    public void publishStatus() {
        int count = tickCount.incrementAndGet();
        long uptime = (System.currentTimeMillis() - startTime) / 1000;
        String nowStr = LocalDateTime.now().format(DateTimeFormatter.ofPattern("HH:mm:ss"));

        SystemStatus status = new SystemStatus(
            "HEALTHY",
            uptime,
            count,
            nowStr
        );

        log.info("Broadcasting scheduled system status to /topic/system-status (tick #{})", count);
        messagingTemplate.convertAndSend("/topic/system-status", status);
    }
}
