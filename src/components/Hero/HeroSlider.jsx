import React, { useState, useEffect } from 'react';
import Hero from './Hero';

function HeroSlider({ slides }) {
    const [currentIndex, setCurrentIndex] = useState(0);

    // Reset index when slides change
    useEffect(() => {
        setCurrentIndex(0);
    }, [slides]);

    if (!slides || slides.length === 0) return null;

    const nextSlide = () => {
        setCurrentIndex((prev) => (prev + 1) % slides.length);
    };

    const prevSlide = () => {
        setCurrentIndex((prev) => (prev === 0 ? slides.length - 1 : prev - 1));
    };

    return (
        <div className="hero-slider-container">
            {slides.map((anime, index) => (
                <Hero
                    key={anime.id || index}
                    anime={anime}
                    isActive={index === currentIndex}
                />
            ))}

            {slides.length > 1 && (
                <>
                    <button className="slider-nav-button slider-prev" onClick={prevSlide}>
                        &#10094;
                    </button>
                    <button className="slider-nav-button slider-next" onClick={nextSlide}>
                        &#10095;
                    </button>
                    <div className="slider-indicators">
                        {slides.map((_, index) => (
                            <button
                                key={index}
                                className={`slider-dot ${index === currentIndex ? 'active' : ''}`}
                                onClick={() => setCurrentIndex(index)}
                            />
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}

export default HeroSlider;
