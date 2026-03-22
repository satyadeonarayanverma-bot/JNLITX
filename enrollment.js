/**
 * EduASK Enrollment & Payment Logic
 * Handles Razorpay checkout and student credential generation.
 */

window.startEnrollmentFlow = async function(amount, courseName) {
    try {
        const toast = showEnrollmentToast(`Initiating payment for ${courseName}...`);

        // 1. Create order on backend
        const response = await fetch('/api/create-order', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ amount: amount })
        });
        
        if (!response.ok) {
            let errorMsg = 'Failed to initialize payment';
            try {
                const errorData = await response.json();
                errorMsg = errorData.error || errorMsg;
            } catch (e) {
                // Not JSON, likely an HTML error page from Vercel
                console.error('Non-JSON error response:', await response.text());
            }
            throw new Error(errorMsg);
        }

        const order = await response.json();
        if (!order.id) throw new Error('Invalid order received from server');

        // 2. Open Razorpay Checkout
        const options = {
            key: 'rzp_test_your_key_here', // In production, this can be fetched or set via env
            amount: order.amount,
            currency: order.currency,
            name: "EduASK Elite",
            description: courseName,
            image: "logo.png",
            order_id: order.id,
            handler: async function (paymentResponse) {
                showEnrollmentModal(paymentResponse, courseName);
            },
            prefill: {
                name: "",
                email: "student@example.com",
                contact: ""
            },
            theme: {
                color: "#0d47a1"
            }
        };

        const rzp = new window.Razorpay(options);
        rzp.on('payment.failed', function (resp) {
            showEnrollmentToast("Payment failed: " + resp.error.description, "#dc2626");
        });
        rzp.open();

    } catch (error) {
        console.error('Enrollment Error:', error);
        showEnrollmentToast(error.message || "Something went wrong. Please try again.", "#dc2626");
    }
};

function showEnrollmentModal(paymentResponse, courseName) {
    let modal = document.getElementById('enrollment-modal');
    if (!modal) {
        injectEnrollmentModalHTML();
        modal = document.getElementById('enrollment-modal');
    }

    const nameStep = document.getElementById('name-step');
    const credentialsStep = document.getElementById('credentials-step');
    const submitNameBtn = document.getElementById('submit-name-btn');
    const nameInput = document.getElementById('student-name-input');

    // Show Name Entry Modal
    modal.style.display = 'flex';
    nameStep.style.display = 'block';
    credentialsStep.style.display = 'none';
    nameInput.value = '';

    submitNameBtn.onclick = async () => {
        const studentName = nameInput.value.trim();
        if (!studentName) {
            showEnrollmentToast("Please enter your name", "#dc2626");
            return;
        }

        submitNameBtn.disabled = true;
        submitNameBtn.textContent = "Verifying...";
        
        try {
            const verification = await fetch('/api/verify-payment', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    razorpay_order_id: paymentResponse.razorpay_order_id,
                    razorpay_payment_id: paymentResponse.razorpay_payment_id,
                    razorpay_signature: paymentResponse.razorpay_signature,
                    student_name: studentName,
                    course_name: courseName
                })
            });

            if (!verification.ok) {
                throw new Error('Verification failed. Please contact support.');
            }

            const result = await verification.json();

            if (result.status === 'success') {
                nameStep.style.display = 'none';
                credentialsStep.style.display = 'block';
                
                document.getElementById('display-enroll-id').textContent = result.enrollment.enrollId;
                document.getElementById('display-password').textContent = result.enrollment.password;

                document.getElementById('copy-credentials-btn').onclick = () => {
                    const text = `Enrollment ID: ${result.enrollment.enrollId}\nPassword: ${result.enrollment.password}`;
                    navigator.clipboard.writeText(text);
                    showEnrollmentToast("Credentials copied to clipboard!", "#16a34a");
                };
            } else {
                showEnrollmentToast(result.message || "Verification failed", "#dc2626");
                submitNameBtn.disabled = false;
                submitNameBtn.textContent = "Generate Credentials";
            }
        } catch (error) {
            console.error('Verification Error:', error);
            showEnrollmentToast("Connection error. Please try again.", "#dc2626");
            submitNameBtn.disabled = false;
            submitNameBtn.textContent = "Generate Credentials";
        }
    };
}

function showEnrollmentToast(message, borderColor = "#ffb300") {
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

function injectEnrollmentModalHTML() {
    const modalHTML = `
    <div id="enrollment-modal" class="modal-overlay" style="display:none; position:fixed; inset:0; background:rgba(0,0,0,0.7); z-index:99999; align-items:center; justify-content:center; backdrop-filter:blur(5px);">
        <div class="modal-content" style="background:#fff; padding:2.5rem; border-radius:24px; max-width:450px; width:90%; position:relative; box-shadow:0 25px 50px -12px rgba(0,0,0,0.25);">
            <div id="name-step">
                <h2 style="margin-top:0; font-family:'Outfit',sans-serif; color:#0f172a;">One Last Step!</h2>
                <p style="color:#475569; margin-bottom:1.5rem;">Enter your full name to generate your unique Enrollment ID and password.</p>
                <input type="text" id="student-name-input" placeholder="Your Full Name" style="width:100%; padding:1rem; border:2px solid #e2e8f0; border-radius:12px; margin-bottom:1.5rem; font-size:1rem; outline:none; transition:border-color 0.2s;">
                <button id="submit-name-btn" class="btn btn-primary" style="width:100%; padding:1rem; border-radius:12px; font-weight:600; cursor:pointer; background:#0d47a1; color:#fff; border:none;">Generate Credentials</button>
            </div>
            <div id="credentials-step" style="display:none; text-align:center;">
                <div style="background:#16a34a; color:#fff; width:60px; height:60px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:2rem; margin:0 auto 1.5rem;">✓</div>
                <h2 style="margin-top:0; font-family:'Outfit',sans-serif; color:#0f172a;">Enrollment Successful!</h2>
                <p style="color:#475569; margin-bottom:1.5rem;">Please save your credentials securely. Use them to log in to your dashboard.</p>
                <div style="background:#f8fafc; padding:1.5rem; border-radius:16px; border:1px dashed #cbd5e1; margin-bottom:1.5rem; text-align:left;">
                    <p style="margin:0 0 0.5rem; font-size:0.9rem; color:#64748b;">Enrollment ID:</p>
                    <p id="display-enroll-id" style="margin:0 0 1rem; font-family:monospace; font-size:1.25rem; font-weight:700; color:#1e293b;"></p>
                    <p style="margin:0 0 0.5rem; font-size:0.9rem; color:#64748b;">Password:</p>
                    <p id="display-password" style="margin:0; font-family:monospace; font-size:1.25rem; font-weight:700; color:#1e293b;"></p>
                </div>
                <button id="copy-credentials-btn" class="btn" style="width:100%; padding:0.8rem; border-radius:10px; font-weight:600; margin-bottom:10px; border:2px solid #e2e8f0; background:none; cursor:pointer;">Copy Credentials</button>
                <a href="studentdashboard.html" style="display:block; width:100%; padding:1rem; background:#0d47a1; color:#fff; text-decoration:none; border-radius:12px; font-weight:600;">Go to Dashboard</a>
            </div>
        </div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    // Add simple hover effect for the name input via JS if needed, but CSS is better.
    const input = document.getElementById('student-name-input');
    if (input) {
        input.onfocus = () => input.style.borderColor = '#0d47a1';
        input.onblur = () => input.style.borderColor = '#e2e8f0';
    }
}
