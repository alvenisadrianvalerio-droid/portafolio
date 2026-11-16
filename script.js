// =====================
//  CONFIGURACIÓN DE SUPABASE
// =====================
const SUPABASE_URL = 'https://zmczrxkpzzuznekvzjpq.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_Pb7lSf6A8VkYXiS5sCAUxw_z7W-cbt_';

// Inicializar Supabase
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// AQUÍ ESTABA EL ERROR: Ahora apunta a tu tabla real
const TABLE_NAME = 'portafolios';
const BUCKET_NAME = 'portafolios';
const MAX_BYTES = 4 * 1024 * 1024;

// Estado global
let currentImageData = null;
let editing = null;
let customProjectsList = [];

const ICONS = {
    edit: `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>`,
    del: `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
    view: `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>`
};

// =====================
//  UTILIDADES
// =====================
const $ = (sel, parent = document) => parent.querySelector(sel);
const $$ = (sel, parent = document) => [...parent.querySelectorAll(sel)];

function escapeHtml(str = '') {
    return String(str).replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}
function escapeAttr(str = '') { return escapeHtml(str); }

function setHint(msg, isError = false) {
    const hint = $('#formHint');
    if (!hint) return;
    hint.textContent = msg;
    hint.classList.toggle('error', isError);
}

// =====================
//  RENDERIZADO DE TARJETAS
// =====================
function buildCardHTML(project, isFixed) {
    const attr = isFixed ? `data-fixed-id="${escapeAttr(project.id)}"` : `data-custom-id="${escapeAttr(project.id)}"`;
    const tags = project.tags?.length
        ? project.tags.map(t => `<span>${escapeHtml(t)}</span>`).join('')
        : '<span>Personalizado</span>';

    return `
        <div class="card-actions">
            <button class="card-edit" title="Editar proyecto" ${attr}>${ICONS.edit}</button>
            <button class="card-delete" title="Eliminar proyecto" ${attr}>${ICONS.del}</button>
        </div>
        <div class="card-image">
            <img src="${escapeAttr(project.image)}" alt="${escapeAttr(project.title)}" loading="lazy">
            <div class="overlay">
                <button class="btn-view" data-title="${escapeAttr(project.title)}" data-desc="${escapeAttr(project.desc)}" data-img="${escapeAttr(project.image)}">
                    ${ICONS.view} Ver detalles
                </button>
            </div>
        </div>
        <div class="card-body">
            <h3>${escapeHtml(project.title)}</h3>
            <p>${escapeHtml(project.desc)}</p>
            <div class="tags">${tags}</div>
        </div>
    `;
}

function createCardElement(project, isFixed) {
    const article = document.createElement('article');
    article.className = 'card reveal visible';
    article.dataset.category = project.category || 'custom';
    if (isFixed) article.dataset.fixedId = project.id;
    else article.dataset.customId = project.id;
    article.innerHTML = buildCardHTML(project, isFixed);
    return article;
}

// =====================
//  LÓGICA DEL FORMULARIO
// =====================
function startEdit(project, isFixed) {
    editing = { type: isFixed ? 'fixed' : 'custom', id: project.id, originalImage: project.image };
    $('#titleInput').value = project.title || '';
    $('#descInput').value = project.desc || '';
    $('#categoryInput').value = project.category || 'custom';

    currentImageData = null;
    $('#preview').src = project.image || '';
    $('#preview').hidden = !project.image;
    $('#dropZone').classList.toggle('has-image', !!project.image);

    $('#submitBtn').textContent = 'Guardar cambios';
    $('#cancelEditBtn').hidden = false;
    $('#creatorTitle').innerHTML = `${ICONS.edit} Editar proyecto`;
    $('#creatorSubtitle').textContent = 'Modifica lo que necesites y guarda los cambios.';

    setHint(isFixed ? 'Editando proyecto fijo.' : 'Editando proyecto personalizado.');
    $('#crear').scrollIntoView({ behavior: 'smooth', block: 'start' });
    $('#titleInput').focus();
}

function resetForm() {
    editing = null;
    currentImageData = null;
    $('#projectForm').reset();
    $('#preview').src = '';
    $('#preview').hidden = true;
    $('#dropZone').classList.remove('has-image');

    $('#submitBtn').textContent = 'Guardar proyecto';
    $('#cancelEditBtn').hidden = true;
    $('#creatorTitle').innerHTML = `${ICONS.edit} Añadir proyecto personalizado`;
    $('#creatorSubtitle').textContent = 'Arrastra una imagen, ponle título y descripción. Se guardará en la nube.';
    setHint('');
}

// =====================
//  MANEJO DE IMÁGENES
// =====================
function compressImage(file, maxWidth = 1000, quality = 0.72) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => {
            const img = new Image();
            img.onload = () => {
                let { width, height } = img;
                if (width > maxWidth) {
                    height = Math.round((height * maxWidth) / width);
                    width = maxWidth;
                }
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                canvas.getContext('2d').drawImage(img, 0, 0, width, height);
                canvas.toBlob(blob => resolve(blob), 'image/jpeg', quality);
            };
            img.onerror = reject;
            img.src = e.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

async function handleFile(file) {
    if (!file?.type.startsWith('image/')) {
        setHint('El archivo debe ser una imagen.', true);
        return;
    }
    try {
        setHint('Procesando imagen...');
        const compressedBlob = await compressImage(file);
        if (compressedBlob.size > MAX_BYTES) {
            setHint('La imagen es demasiado grande.', true);
            return;
        }
        currentImageData = compressedBlob;
        const objectURL = URL.createObjectURL(compressedBlob);

        $('#preview').src = objectURL;
        $('#preview').hidden = false;
        $('#dropZone').classList.add('has-image');
        setHint('Imagen lista para subir.');
    } catch (err) {
        setHint('Error al procesar la imagen.', true);
    }
}

// =====================
//  SUPABASE: SUBIR IMAGEN
// =====================
async function uploadImageToSupabase(blob) {
    const fileName = `img_${Date.now()}_${Math.random().toString(36).substring(2, 9)}.jpg`;

    const { data, error } = await supabaseClient.storage
        .from(BUCKET_NAME)
        .upload(fileName, blob, { contentType: 'image/jpeg' });

    if (error) throw new Error('Error subiendo imagen: ' + error.message);

    const { data: { publicUrl } } = supabaseClient.storage
        .from(BUCKET_NAME)
        .getPublicUrl(fileName);

    return { publicUrl, fileName };
}

// =====================
//  EVENTOS GLOBALES Y DELEGACIÓN
// =====================
document.addEventListener('DOMContentLoaded', () => {
    // 1. Menú móvil
    $('#menuToggle')?.addEventListener('click', () => {
        const isOpen = $('#navLinks').classList.toggle('open');
        $('#menuToggle').setAttribute('aria-expanded', isOpen);
    });
    $$('.nav-links a').forEach(link => {
        link.addEventListener('click', () => {
            $('#navLinks').classList.remove('open');
            $('#menuToggle').setAttribute('aria-expanded', 'false');
        });
    });

    // 2. Filtros
    $$('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            $$('.filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const filter = btn.dataset.filter;
            $$('.card').forEach(card => {
                card.classList.toggle('hidden', filter !== 'all' && card.dataset.category !== filter);
            });
        });
    });

    // 3. Scroll suave, Spy y Reveal
    $$('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            const id = this.getAttribute('href');
            if (id === '#') return;
            const target = $(id);
            if (target) {
                e.preventDefault();
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
    });

    const spyObserver = new IntersectionObserver(entries => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                $$('.nav-links a').forEach(a => a.classList.toggle('active', a.getAttribute('href') === '#' + entry.target.id));
            }
        });
    }, { rootMargin: '-45% 0px -50% 0px' });
    $$('section[id]').forEach(s => spyObserver.observe(s));

    const revealObserver = new IntersectionObserver(entries => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                revealObserver.unobserve(entry.target);
            }
        });
    }, { threshold: 0.1 });
    window.observeReveals = () => $$('.reveal:not(.visible)').forEach(el => revealObserver.observe(el));
    window.observeReveals();

    // 4. Botón volver arriba
    const toTop = $('#toTop');
    window.addEventListener('scroll', () => toTop.classList.toggle('visible', window.scrollY > 400));
    toTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

    // 5. Modal de proyecto
    const modal = $('#projectModal');
    document.addEventListener('click', e => {
        const btnView = e.target.closest('.btn-view');
        if (btnView) {
            $('#modalTitle').textContent = btnView.dataset.title;
            $('#modalDesc').textContent = btnView.dataset.desc;
            $('#modalImg').src = btnView.dataset.img;
            modal.classList.add('open');
            modal.setAttribute('aria-hidden', 'false');
        }
        if (e.target.closest('#modalClose') || e.target === modal) {
            modal.classList.remove('open');
            modal.setAttribute('aria-hidden', 'true');
        }
    });
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            modal.classList.remove('open');
            modal.setAttribute('aria-hidden', 'true');
        }
    });

    // 6. Gestión de Drag & Drop y Paste
    const dropZone = $('#dropZone');
    const fileInput = $('#fileInput');

    dropZone.addEventListener('click', () => fileInput.click());
    dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('dragover'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
    dropZone.addEventListener('drop', e => { e.preventDefault(); dropZone.classList.remove('dragover'); handleFile(e.dataTransfer.files[0]); });
    fileInput.addEventListener('change', e => handleFile(e.target.files[0]));

    document.addEventListener('paste', async e => {
        const imageFile = [...(e.clipboardData?.items || [])].find(i => i.type.startsWith('image/'))?.getAsFile();
        if (!imageFile) return;
        if (!['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) e.preventDefault();
        setHint('Imagen pegada. Procesando...');
        await handleFile(new File([imageFile], `paste_${Date.now()}.png`, { type: imageFile.type }));
        $('#crear').scrollIntoView({ behavior: 'smooth', block: 'start' });
        $('#titleInput').focus();
    });

    // 7. Form Submit
    $('#projectForm').addEventListener('submit', async e => {
        e.preventDefault();
        const submitBtn = $('#submitBtn');

        if (!currentImageData && !editing?.originalImage) {
            return setHint('Falta la imagen.', true);
        }
        if (!$('#titleInput').value.trim() || !$('#descInput').value.trim()) {
            return setHint('Título y descripción obligatorios.', true);
        }

        submitBtn.disabled = true;
        setHint('Guardando en la nube...');

        try {
            let imageUrl = editing?.originalImage || '';

            if (currentImageData) {
                const { publicUrl } = await uploadImageToSupabase(currentImageData);
                imageUrl = publicUrl;
            }

            const data = {
                titulo: $('#titleInput').value.trim(),
                descripcion: $('#descInput').value.trim(),
                categoria: $('#categoryInput').value,
                imagen_url: imageUrl
            };

            if (editing) {
                if (editing.type === 'custom') {
                    const { error } = await supabaseClient
                        .from(TABLE_NAME)
                        .update(data)
                        .eq('id', editing.id);
                    if (error) throw error;

                    const oldCard = $(`.card[data-custom-id="${CSS.escape(editing.id)}"]`);
                    if (oldCard) {
                        const updatedProject = { id: editing.id, title: data.titulo, desc: data.descripcion, category: data.categoria, image: data.imagen_url };
                        oldCard.replaceWith(createCardElement(updatedProject, false));
                    }
                } else {
                    const overrides = JSON.parse(localStorage.getItem('fixed_overrides') || '{}');
                    overrides[editing.id] = data;
                    localStorage.setItem('fixed_overrides', JSON.stringify(overrides));

                    const oldCard = $(`.card[data-fixed-id="${CSS.escape(editing.id)}"]`);
                    if (oldCard) {
                        const updatedProject = { id: editing.id, title: data.titulo, desc: data.descripcion, category: data.categoria, image: data.imagen_url };
                        oldCard.replaceWith(createCardElement(updatedProject, true));
                    }
                }
                setHint('¡Cambios guardados!');
            } else {
                const { data: inserted, error } = await supabaseClient
                    .from(TABLE_NAME)
                    .insert([data])
                    .select();

                if (error) throw error;

                const newProject = { id: inserted[0].id, title: data.titulo, desc: data.descripcion, category: data.categoria, image: data.imagen_url };
                $('#projects-grid').appendChild(createCardElement(newProject, false));
                setHint('¡Proyecto guardado en la nube!');
            }
            resetForm();
        } catch (err) {
            console.error(err);
            setHint('Error al guardar. Revisa la consola (F12).', true);
        } finally {
            submitBtn.disabled = false;
        }
    });

    // 8. Botones del formulario
    $('#clearBtn').addEventListener('click', resetForm);
    $('#cancelEditBtn').addEventListener('click', resetForm);

    $('#restoreBtn').addEventListener('click', () => {
        if (confirm('¿Restaurar todos los proyectos fijos originales?')) {
            localStorage.removeItem('fixed_overrides');
            location.reload();
        }
    });

    // 9. Delegación de eventos para botones dentro de las tarjetas (Editar/Eliminar)
    $('#projects-grid').addEventListener('click', async e => {
        const editBtn = e.target.closest('.card-edit');
        const delBtn = e.target.closest('.card-delete');

        if (editBtn) {
            const isFixed = editBtn.hasAttribute('data-fixed-id');
            const id = editBtn.dataset[isFixed ? 'fixedId' : 'customId'];
            const card = editBtn.closest('.card');

            const img = card.querySelector('img').src;
            const title = card.querySelector('h3').textContent;
            const desc = card.querySelector('p').textContent;

            startEdit({ id, title, desc, image: img, category: card.dataset.category }, isFixed);
        }

        if (delBtn) {
            if (!confirm('¿Eliminar este proyecto?')) return;
            const isFixed = delBtn.hasAttribute('data-fixed-id');
            const id = delBtn.dataset[isFixed ? 'fixedId' : 'customId'];

            if (isFixed) {
                const overrides = JSON.parse(localStorage.getItem('fixed_overrides') || '{}');
                overrides[id] = { deleted: true };
                localStorage.setItem('fixed_overrides', JSON.stringify(overrides));
            } else {
                const { error } = await supabaseClient
                    .from(TABLE_NAME)
                    .delete()
                    .eq('id', id);
                if (error) {
                    alert('No se pudo eliminar de la nube.');
                    return;
                }
            }
            delBtn.closest('.card').remove();
        }
    });

    // 10. Inicialización: Traer proyectos de Supabase y aplicar overrides
    (async () => {
        try {
            const overrides = JSON.parse(localStorage.getItem('fixed_overrides') || '{}');
            for (const [id, ov] of Object.entries(overrides)) {
                const card = $(`.card[data-fixed-id="${CSS.escape(id)}"]`);
                if (!card) continue;
                if (ov.deleted) card.remove();
                else card.replaceWith(createCardElement({ id, title: ov.titulo, desc: ov.descripcion, category: ov.categoria, image: ov.imagen_url }, true));
            }

            // Pedir datos a Supabase
            const { data, error } = await supabaseClient
                .from(TABLE_NAME)
                .select('*')
                .order('id', { ascending: true });

            if (error) throw error;

            if (data && data.length > 0) {
                const fragment = document.createDocumentFragment();
                data.forEach(row => {
                    const project = {
                        id: row.id,
                        title: row.titulo,
                        desc: row.descripcion,
                        category: row.categoria,
                        image: row.imagen_url
                    };
                    customProjectsList.push(project);
                    fragment.appendChild(createCardElement(project, false));
                });
                $('#projects-grid').appendChild(fragment);
            }

            window.observeReveals();
        } catch (err) {
            console.error('Error cargando proyectos:', err);
            setHint('No se pudieron cargar los proyectos de la nube.', true);
        }
    })();
});