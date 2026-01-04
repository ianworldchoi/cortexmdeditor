import { ButtonHTMLAttributes } from 'react'
import Squircle from './Squircle'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'default' | 'danger'
    size?: 'sm' | 'md' | 'lg'
}

export default function Button({
    variant = 'default',
    size = 'md',
    className = '',
    children,
    ...props
}: ButtonProps) {
    const baseClasses = 'btn btn-squircle'
    const variantClasses = {
        primary: 'btn-primary',
        default: 'btn-default',
        danger: 'btn-danger'
    }
    const sizeClasses = {
        sm: 'btn-sm',
        md: 'btn-md',
        lg: 'btn-lg'
    }

    const classes = [
        baseClasses,
        variantClasses[variant],
        sizeClasses[size],
        className
    ].filter(Boolean).join(' ')

    return (
        <Squircle
            as="button"
            className={classes}
            cornerRadius="var(--radius-md)" // Standardized
            cornerSmoothing={1} // iOS style
            // Button styles often rely on CSS for background.
            // Squircle renders the 'as' element.
            // but clip-path might clip borders if they are CSS borders.
            // we assume .btn uses background colors and no borders or we'd need to handle them.
            // Checking components.css, .btn has no border by default, just bg.
            style={{
                border: 'none', // Ensure generic border is off
                cursor: props.disabled ? 'not-allowed' : 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                // Overriding potential unexpected browser defaults for button
            }}
            {...props}
        >
            {children}
        </Squircle>
    )
}
