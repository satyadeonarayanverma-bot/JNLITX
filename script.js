/* ===================================================================
   EduASK — Professional JavaScript Enhancements v2
   =================================================================== */
document.addEventListener('DOMContentLoaded', () => {

    /* --- Mobile Navigation --- */
    const mobileMenuBtn = document.getElementById('mobile-menu-btn') || document.querySelector('.mobile-menu-btn');
    const mobileNav = document.getElementById('mobile-nav') || document.getElementById('navLinks');
    const mobileLinks = document.querySelectorAll('.mobile-link, #navLinks a');

    window.toggleMenu = () => {
        const btn = document.getElementById('mobile-menu-btn') || document.querySelector('.mobile-menu-btn');
        const nav = document.getElementById('mobile-nav') || document.getElementById('navLinks');
        
        if (btn && nav) {
            btn.classList.toggle('active');
            nav.classList.toggle('active');
            const isActive = nav.classList.contains('active');
            document.body.style.overflow = isActive ? 'hidden' : '';
        }
    };

    if (mobileMenuBtn) {
        mobileMenuBtn.addEventListener('click', toggleMenu);
    }

    mobileLinks.forEach(link => {
        link.addEventListener('click', () => {
            const btn = document.getElementById('mobile-menu-btn') || document.querySelector('.mobile-menu-btn');
            const nav = document.getElementById('mobile-nav') || document.getElementById('navLinks');
            if (btn) btn.classList.remove('active');
            if (nav) nav.classList.remove('active');
            document.body.style.overflow = '';
        });
    });

    /* --- Navbar Shadow on Scroll --- */
    const navbar = document.getElementById('navbar');

    const updateNavbar = () => {
        if (window.scrollY > 30) {
            navbar.classList.add('scrolled');
        } else {
            navbar.classList.remove('scrolled');
        }
    };

    window.addEventListener('scroll', updateNavbar, { passive: true });
    updateNavbar();

    /* --- Smooth Scrolling for Anchor Links --- */
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            const id = this.getAttribute('href');
            if (id === '#') return;
            const target = document.querySelector(id);
            if (target) {
                e.preventDefault();
                const offset = navbar ? navbar.offsetHeight : 0;
                const top = target.getBoundingClientRect().top + window.scrollY - offset;
                window.scrollTo({ top, behavior: 'smooth' });
            }
        });
    });

    /* --- Animated Counter for Stats Section --- */
    const statNumbers = document.querySelectorAll('.stat-number');
    let statsAnimated = false;

    const animateCount = (el) => {
        const target = parseInt(el.getAttribute('data-target'), 10);
        if (isNaN(target)) return;

        const duration = 2000;
        const step = Math.ceil(target / (duration / 16));
        let current = 0;

        const tick = () => {
            current += step;
            if (current >= target) {
                el.textContent = target.toLocaleString();
                return;
            }
            el.textContent = current.toLocaleString();
            requestAnimationFrame(tick);
        };

        requestAnimationFrame(tick);
    };

    const statsObserver = new IntersectionObserver(
        (entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting && !statsAnimated) {
                    statsAnimated = true;
                    statNumbers.forEach(num => animateCount(num));
                }
            });
        },
        { threshold: 0.3 }
    );

    const statsBar = document.querySelector('.stats-bar');
    if (statsBar) statsObserver.observe(statsBar);

    /* --- Godly 3D Parallax Tilt --- */
    const godlyCards = document.querySelectorAll('.certificate-preview');

    godlyCards.forEach(card => {
        if (window.innerWidth > 1024) {
            card.addEventListener('mousemove', (e) => {
                const rect = card.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;
                const cx = rect.width / 2;
                const cy = rect.height / 2;

                // Parallax depth calculation
                const rx = ((y - cy) / cy) * -6;
                const ry = ((x - cx) / cx) * 6;

                card.style.transform = `perspective(1200px) rotateX(${rx}deg) rotateY(${ry}deg) scale3d(1.02, 1.02, 1.02)`;
                card.style.transition = 'transform 0.1s ease-out';

                // Add dynamic glow follow
                if (card.classList.contains('course-card-godly')) {
                    const glowX = (x / rect.width) * 100;
                    const glowY = (y / rect.height) * 100;
                    card.style.background = `radial-gradient(circle at ${glowX}% ${glowY}%, rgba(13, 71, 161, 0.08) 0%, var(--glass-bg) 60%)`;
                }
            });

            card.addEventListener('mouseleave', () => {
                card.style.transform = 'perspective(1200px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)';
                card.style.transition = 'transform 0.6s cubic-bezier(0.23, 1, 0.32, 1)';
                if (card.classList.contains('course-card-godly')) {
                    card.style.background = 'var(--glass-bg)';
                }
            });
        }
    });



    /* --- Razorpay Integration --- */
    const enrollNowBtn = document.getElementById('enroll-now-btn');
    if (enrollNowBtn) {
        enrollNowBtn.addEventListener('click', () => {
            if (window.startEnrollmentFlow) {
                window.startEnrollmentFlow(999, "EduASK Elite Mastery Course");
            } else {
                console.error("Enrollment logic not loaded");
            }
        });
    }

    /* Helper for Toast */
    function showToast(message, borderColor = "#ffb300") {
        if (window.showEnrollmentToast) return window.showEnrollmentToast(message, borderColor);
        
        const toast = document.createElement('div');
        toast.style.cssText = `
            position: fixed; bottom: 2rem; right: 2rem;
            background: #0b1120; color: white;
            padding: 1.25rem 2.5rem; border-radius: 16px;
            box-shadow: 0 20px 40px rgba(0,0,0,0.3); z-index: 10000;
            transform: translateY(100px); opacity: 0;
            transition: all 0.5s cubic-bezier(0.23, 1, 0.32, 1);
            font-weight: 600; font-family: 'Inter', sans-serif;
            border-left: 4px solid ${borderColor};
        `;
        toast.textContent = message;
        document.body.appendChild(toast);

        setTimeout(() => {
            toast.style.transform = 'translateY(0)';
            toast.style.opacity = '1';
        }, 100);

        setTimeout(() => {
            if (toast.parentNode) {
                toast.style.transform = 'translateY(20px)';
                toast.style.opacity = '0';
                setTimeout(() => toast.remove(), 500);
            }
        }, 4000);

        return toast;
    }

    /* --- Page Entry Reveals --- */
    const revealElements = document.querySelectorAll('.mnc-logo-item, .cert-showcase-text, .cert-showcase-visual');
    const revealObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
                revealObserver.unobserve(entry.target);
            }
        });
    }, { threshold: 0.15 });

    revealElements.forEach((el, i) => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(30px)';
        el.style.transition = `all 0.8s cubic-bezier(0.23, 1, 0.32, 1) ${i * 0.05}s`;
        revealObserver.observe(el);
    });

    /* --- Scroll Progress Bar --- */
    const progress = document.createElement('div');
    progress.style.cssText = 'position: fixed; top: 0; left: 0; height: 3px; background: linear-gradient(90deg, #0d47a1, #ffb300); width: 0%; z-index: 9999; transition: width 0.1s ease;';
    document.body.appendChild(progress);

    window.addEventListener('scroll', () => {
        const winScroll = document.body.scrollTop || document.documentElement.scrollTop;
        const height = document.documentElement.scrollHeight - document.documentElement.clientHeight;
        const scrolled = (winScroll / height) * 100;
        progress.style.width = scrolled + "%";
    }, { passive: true });

    /* --- Active Nav Link Highlighting on Scroll (index only) --- */
    const sections = document.querySelectorAll('section[id]');
    const navAnchors = document.querySelectorAll('.nav-links a[href^="#"]');

    if (sections.length > 0) {
        const highlightNav = () => {
            const scrollY = window.scrollY + 120;
            sections.forEach(section => {
                const top = section.offsetTop;
                const height = section.offsetHeight;
                const id = section.getAttribute('id');

                if (scrollY >= top && scrollY < top + height) {
                    navAnchors.forEach(a => {
                        a.classList.remove('active-link');
                        if (a.getAttribute('href') === '#' + id) {
                            a.classList.add('active-link');
                        }
                    });
                }
            });
        };
        window.addEventListener('scroll', highlightNav, { passive: true });
    }

    /* Hero animation simplified - using premium 3D static visual */


    /* --- FAQ Accordion Interactivity --- */
    const faqItems = document.querySelectorAll('.faq-item');
    faqItems.forEach(item => {
        const question = item.querySelector('.faq-question');
        question.addEventListener('click', () => {
            const isActive = item.classList.contains('active');
            
            // Close all other items
            faqItems.forEach(otherItem => {
                otherItem.classList.remove('active');
                const otherAnswer = otherItem.querySelector('.faq-answer');
                if (otherAnswer) otherAnswer.style.maxHeight = null;
            });

            // Toggle current item
            if (!isActive) {
                item.classList.add('active');
                const answer = item.querySelector('.faq-answer');
                if (answer) answer.style.maxHeight = answer.scrollHeight + "px";
            }
        });
    });

    /* --- EMI Calculator Logic --- */
    const loanAmountInput = document.getElementById('loanAmount');
    const interestRateInput = document.getElementById('interestRate');
    const loanTenureInput = document.getElementById('loanTenure');

    const loanAmountValue = document.getElementById('loanAmountValue');
    const interestRateValue = document.getElementById('interestRateValue');
    const loanTenureValue = document.getElementById('loanTenureValue');

    const monthlyEMIResult = document.getElementById('monthlyEMI');
    const totalInterestResult = document.getElementById('totalInterest');
    const totalPayableResult = document.getElementById('totalPayable');

    const calculateEMI = () => {
        const P = parseFloat(loanAmountInput.value);
        const R = parseFloat(interestRateInput.value) / 12 / 100;
        const N = parseFloat(loanTenureInput.value);

        // EMI = P * r * (1 + r)^n / ((1 + r)^n - 1)
        const emi = (P * R * Math.pow(1 + R, N)) / (Math.pow(1 + R, N) - 1);
        const totalPayable = emi * N;
        const totalInterest = totalPayable - P;

        // Update UI
        loanAmountValue.textContent = P.toLocaleString('en-IN');
        interestRateValue.textContent = interestRateInput.value;
        loanTenureValue.textContent = N;

        monthlyEMIResult.textContent = Math.round(emi).toLocaleString('en-IN');
        totalInterestResult.textContent = '₹ ' + Math.round(totalInterest).toLocaleString('en-IN');
        totalPayableResult.textContent = '₹ ' + Math.round(totalPayable).toLocaleString('en-IN');

        // Dynamic Slider Highlight
        const updateSliderBg = (input) => {
            const min = input.min || 0;
            const max = input.max || 100;
            const val = input.value;
            const percentage = (val - min) * 100 / (max - min);
            input.style.backgroundSize = percentage + '% 100%';
        };

        [loanAmountInput, interestRateInput, loanTenureInput].forEach(updateSliderBg);
    };

    if (loanAmountInput && interestRateInput && loanTenureInput) {
        [loanAmountInput, interestRateInput, loanTenureInput].forEach(input => {
            input.addEventListener('input', calculateEMI);
        });
        // Initial calculation
        calculateEMI();
    }
});

