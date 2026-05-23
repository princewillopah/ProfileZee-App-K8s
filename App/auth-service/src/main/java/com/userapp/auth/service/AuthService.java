package com.userapp.auth.service;

import com.userapp.auth.config.JwtUtil;
import com.userapp.auth.model.AuthCredential;
import com.userapp.auth.repository.AuthRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;
import java.time.Duration;
import java.util.*;

@Service
@RequiredArgsConstructor
public class AuthService {

    private final AuthRepository authRepository;
    private final JwtUtil jwtUtil;
    private final StringRedisTemplate redisTemplate;
    private final BCryptPasswordEncoder passwordEncoder = new BCryptPasswordEncoder();

    public Map<String, Object> register(String userId, String email, String password, String role) {
        if (authRepository.existsByEmail(email)) {
            throw new RuntimeException("Email already registered");
        }

        AuthCredential cred = AuthCredential.builder()
                .userId(userId)
                .email(email)
                .passwordHash(passwordEncoder.encode(password))
                .role(role != null ? role : "member")
                .build();

        authRepository.save(cred);
        String token = jwtUtil.generateToken(userId, email, cred.getRole());

        // Store session in Redis (expires in 24h)
        redisTemplate.opsForValue().set("session:" + userId, token, Duration.ofHours(24));

        return Map.of("token", token, "userId", userId, "role", cred.getRole());
    }

    public Map<String, Object> login(String email, String password) {
        AuthCredential cred = authRepository.findByEmail(email)
                .orElseThrow(() -> new RuntimeException("Invalid credentials"));

        if (!passwordEncoder.matches(password, cred.getPasswordHash())) {
            throw new RuntimeException("Invalid credentials");
        }

        String token = jwtUtil.generateToken(cred.getUserId(), email, cred.getRole());
        redisTemplate.opsForValue().set("session:" + cred.getUserId(), token, Duration.ofHours(24));

        return Map.of("token", token, "userId", cred.getUserId(), "role", cred.getRole());
    }

    public Map<String, Object> validateToken(String token) {
        if (!jwtUtil.isTokenValid(token)) {
            throw new RuntimeException("Invalid or expired token");
        }
        var claims = jwtUtil.validateToken(token);
        return Map.of(
                "valid", true,
                "userId", claims.getSubject(),
                "email", claims.get("email"),
                "role", claims.get("role")
        );
    }

    public void logout(String userId) {
        redisTemplate.delete("session:" + userId);
    }
}
