package com.userapp.auth.repository;

import com.userapp.auth.model.AuthCredential;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;

public interface AuthRepository extends JpaRepository<AuthCredential, String> {
    Optional<AuthCredential> findByEmail(String email);
    Optional<AuthCredential> findByUserId(String userId);
    boolean existsByEmail(String email);
}
