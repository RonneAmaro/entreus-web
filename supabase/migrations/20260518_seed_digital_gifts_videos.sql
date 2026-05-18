-- Seed/update animated digital gifts.
-- Review and apply manually in Supabase. Do not run automatically from Codex.

insert into public.digital_gifts (
  name,
  slug,
  description,
  price_itacash,
  media_url,
  media_type,
  category,
  is_active,
  sort_order
) values
  ('Parabens com Confetes', 'parabens-confetes', 'Celebracao animada com confetes para momentos especiais.', 10, '/gifts/videos/parabens-confetes.mp4', 'video', 'celebration', true, 10),
  ('Trofeu Conquista', 'trofeu-conquista', 'Um trofeu premium para reconhecer uma grande conquista.', 50, '/gifts/videos/trofeu-conquista.mp4', 'video', 'premium', true, 20),
  ('Bilhete da Sorte', 'bilhete-sorte', 'Um presente leve para desejar sorte e boas novidades.', 15, '/gifts/videos/bilhete-sorte.mp4', 'video', 'standard', true, 30),
  ('Aplausos Animados', 'aplausos-animados', 'Aplausos para incentivar criadores e amigos.', 20, '/gifts/videos/aplausos-animados.mp4', 'video', 'support', true, 40),
  ('Feliz Aniversario', 'feliz-aniversario', 'Uma mensagem animada para celebrar aniversarios.', 20, '/gifts/videos/feliz-aniversario.mp4', 'video', 'celebration', true, 50),
  ('Medalha de Gratidao', 'medalha-gratidao', 'Uma medalha para demonstrar gratidao e apoio.', 30, '/gifts/videos/medalha-gratidao.mp4', 'video', 'support', true, 60),
  ('Foguete de Apoio', 'foguete-apoio', 'Um foguete para impulsionar uma pessoa ou publicacao.', 25, '/gifts/videos/foguete-apoio.mp4', 'video', 'support', true, 70),
  ('Coracao Pulsante', 'coracao-pulsante', 'Um coracao animado para demonstrar carinho.', 15, '/gifts/videos/coracao-pulsante.mp4', 'video', 'standard', true, 80),
  ('Coroa de Destaque', 'coroa-destaque', 'Uma coroa premium para quem merece destaque.', 100, '/gifts/videos/coroa-destaque.mp4', 'video', 'premium', true, 90),
  ('Estrela Cadente', 'estrela-cadente', 'Uma estrela para iluminar uma conquista ou momento.', 25, '/gifts/videos/estrela-cadente.mp4', 'video', 'celebration', true, 100),
  ('Microfone Brilho', 'microfone-brilho', 'Um presente para valorizar vozes, artistas e criadores.', 30, '/gifts/videos/microfone-brilho.mp4', 'video', 'creator', true, 110),
  ('Presente Misterioso', 'presente-misterioso', 'Uma surpresa animada para presentear com curiosidade.', 40, '/gifts/videos/presente-misterioso.mp4', 'video', 'special', true, 120),
  ('Livro de Ouro', 'livro-ouro', 'Um presente para ideias, historias e conteudos marcantes.', 35, '/gifts/videos/livro-ouro.mp4', 'video', 'creator', true, 130),
  ('Camera Criativa', 'camera-criativa', 'Um presente para reconhecer criatividade visual.', 35, '/gifts/videos/camera-criativa.mp4', 'video', 'creator', true, 140),
  ('Mapa do Tesouro', 'mapa-tesouro', 'Um presente especial para jornadas e descobertas.', 30, '/gifts/videos/mapa-tesouro.mp4', 'video', 'special', true, 150),
  ('Chave Dourada', 'chave-dourada', 'Uma chave premium para simbolizar novas portas abertas.', 75, '/gifts/videos/chave-dourada.mp4', 'video', 'premium', true, 160),
  ('Cafe Quentinho', 'cafe-quentinho', 'Um cafe virtual para apoiar com carinho.', 10, '/gifts/videos/cafe-quentinho.mp4', 'video', 'standard', true, 170),
  ('Arco-Iris', 'arco-iris', 'Um presente colorido para celebrar alegria e boas energias.', 20, '/gifts/videos/arco-iris.mp4', 'video', 'celebration', true, 180),
  ('Estatua de Parceria', 'estatua-parceria', 'Um reconhecimento premium para parcerias importantes.', 80, '/gifts/videos/estatua-parceria.mp4', 'video', 'premium', true, 190),
  ('Fogos de Artificio', 'fogos-artificio', 'Uma celebracao animada para momentos memoraveis.', 60, '/gifts/videos/fogos-artificio.mp4', 'video', 'celebration', true, 200)
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  price_itacash = excluded.price_itacash,
  media_url = excluded.media_url,
  media_type = excluded.media_type,
  category = excluded.category,
  is_active = excluded.is_active,
  sort_order = excluded.sort_order,
  updated_at = now();
