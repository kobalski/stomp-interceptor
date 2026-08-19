package com.example.stomp.controller;

import com.example.stomp.model.ChatMessage;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.handler.annotation.SendTo;
import org.springframework.messaging.simp.annotation.SubscribeMapping;
import org.springframework.stereotype.Controller;

import java.time.Instant;
import java.util.UUID;

@Controller
public class StompMessageController {

    private static final Logger log = LoggerFactory.getLogger(StompMessageController.class);

    @MessageMapping("/chat")
    @SendTo("/topic/messages")
    public ChatMessage handleChatMessage(@Payload ChatMessage message) {
        log.info("Received STOMP chat message from '{}': {}", message.getSender(), message.getContent());
        if (message.getId() == null || message.getId().trim().isEmpty()) {
            message.setId(UUID.randomUUID().toString());
        }
        if (message.getTimestamp() == 0) {
            message.setTimestamp(Instant.now().toEpochMilli());
        }
        return message;
    }

    @MessageMapping("/echo")
    @SendTo("/topic/echo")
    public ChatMessage handleEchoMessage(@Payload ChatMessage message) {
        log.info("Received STOMP echo message from '{}': {}", message.getSender(), message.getContent());
        ChatMessage response = new ChatMessage();
        response.setId(UUID.randomUUID().toString());
        response.setSender("Server Echo");
        response.setContent("Echo payload: " + message.getContent());
        response.setType("ECHO_RESPONSE");
        response.setTimestamp(Instant.now().toEpochMilli());
        return response;
    }

    @SubscribeMapping("/topic/welcome")
    public ChatMessage handleWelcomeSubscribe() {
        log.info("Client subscribed to /topic/welcome");
        return new ChatMessage(
            UUID.randomUUID().toString(),
            "Server System",
            "Welcome! Subscribed to STOMP topic /topic/welcome",
            "WELCOME",
            Instant.now().toEpochMilli()
        );
    }
}
