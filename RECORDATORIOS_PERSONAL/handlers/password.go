package handlers

import (
	"errors"
	"unicode"

	"golang.org/x/crypto/bcrypt"
)

// hashearPassword genera el hash bcrypt de una contraseña.
func hashearPassword(password string) (string, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return "", err
	}
	return string(hash), nil
}

// HashearPassword expone el hash bcrypt para herramientas de administración.
func HashearPassword(password string) (string, error) {
	return hashearPassword(password)
}

// verificarPassword compara una contraseña en claro con su hash bcrypt.
func verificarPassword(password, hash string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)) == nil
}

// validarPassword aplica la política mínima de contraseñas.
func validarPassword(password string) error {
	if len([]rune(password)) < 8 {
		return errors.New("La contraseña debe tener al menos 8 caracteres")
	}
	if len([]rune(password)) > 72 {
		return errors.New("La contraseña es demasiado larga (máximo 72 caracteres)")
	}

	var tieneLetra, tieneNumero bool
	for _, r := range password {
		switch {
		case unicode.IsLetter(r):
			tieneLetra = true
		case unicode.IsDigit(r):
			tieneNumero = true
		}
	}
	if !tieneLetra || !tieneNumero {
		return errors.New("La contraseña debe incluir al menos una letra y un número")
	}
	return nil
}
