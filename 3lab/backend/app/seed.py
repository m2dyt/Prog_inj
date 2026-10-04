"""Create users and seed a small, source-backed supermarket assortment."""
import os

from .db import create_pool
from .security import hash_password


def item(barcode, name, category, price, stock, *, brand=None, description=None,
         ingredients=None, proteins=None, fats=None, carbohydrates=None,
         calories=None, image_url=None, source_url=None):
    return (barcode, name, category, brand, description, ingredients, proteins,
            fats, carbohydrates, calories, image_url, source_url, price, stock)


# Curated real retail products. Prices and quantities are local demo values;
# every descriptive field and barcode is source-backed.
PRODUCTS = [
    item('4602547000886', 'Молоко «Пискарёвское» пастеризованное 2,5% · 1 л', 'Молочные продукты', '89.90', 86,
         brand='Пискарёвское', description='Пастеризованное питьевое коровье молоко, 2,5% жирности, 1 л.',
         ingredients='Молоко цельное, молоко обезжиренное.', proteins='3', fats='2.5', carbohydrates='4.7', calories='53',
         image_url='https://tknarodniy.ru/resources/images/products/4602547000886.png',
         source_url='https://online.metro-cc.ru/products/moloko-piskarevskoye-pasterizovannoye-2-5-1l-66742'),
    item('4680017920605', 'Молоко «ЭкоНива» ультрапастеризованное 3,2% · 1 л', 'Молочные продукты', '149.90', 53,
         brand='ЭкоНива', description='Ультрапастеризованное коровье молоко 3,2% в упаковке 1 л.',
         ingredients='Молоко нормализованное.', proteins='3', fats='3.2', carbohydrates='4.7', calories='60',
         image_url='https://www.ekoniva-moloko.com/uploads/3/moloko-ultrapaster-3.2-tetrapack-2.jpg',
         source_url='https://www.ekoniva-moloko.com/catalog/moloko/moloko-ultrapasterizovannoe-32'),
    item('4680017920629', 'Молоко «ЭкоНива» ультрапастеризованное 2,5% · 1 л', 'Молочные продукты', '145.90', 29,
         brand='ЭкоНива', description='Ультрапастеризованное коровье молоко 2,5% в упаковке 1 л.',
         ingredients='Молоко нормализованное.', proteins='3', fats='2.5', carbohydrates='4.7', calories='55',
         image_url='https://www.ekoniva-moloko.com/uploads/3/moloko-ultrapaster-2.5-tetrapack-1.jpg',
         source_url='https://www.ekoniva-moloko.com/catalog/moloko/moloko-ultrapasterizovannoe-25'),
    item('4607161624647', 'Молоко «Простоквашино» ультрапастеризованное 2,5% · 950 мл', 'Молочные продукты', '104.90', 40,
         brand='Простоквашино', description='Ультрапастеризованное питьевое молоко 2,5%, 950 мл.',
         ingredients='Молоко нормализованное.', proteins='2.9', fats='2.5', carbohydrates='4.8', calories='53',
         image_url='https://prostokvashino.ru/upload/resize_cache/iblock/c70/640_640_0/v4ot45byjq1eelukh93f5khxwffq9c4f.jpg',
         source_url='https://prostokvashino.ru/product/moloko-ultrapasterizovannoe-2-5-950-ml/'),
    item('4607161624661', 'Молоко «Простоквашино» ультрапастеризованное 3,2% · 950 мл', 'Молочные продукты', '109.90', 64,
         brand='Простоквашино', description='Ультрапастеризованное питьевое молоко 3,2%, 950 мл.',
         ingredients='Молоко нормализованное.', proteins='3.2', fats='2.9', carbohydrates='4.7', calories='59',
         image_url='https://prostokvashino.ru/upload/resize_cache/iblock/656/640_640_0/n9etordcp0j9dqp7gw7rxe224vx6oedv.jpg',
         source_url='https://prostokvashino.ru/product/moloko-ultrapasterizovannoe-3-2-950-ml/'),
    item('4601751010506', 'Молоко «Вкуснотеево» ультрапастеризованное 2,5% · 900 г', 'Молочные продукты', '119.90', 42,
         brand='Вкуснотеево', description='Ультрапастеризованное молоко жирностью 2,5%, 900 г.',
         ingredients='Цельное молоко, обезжиренное молоко.', proteins='2.8', fats='2.5', carbohydrates='4.7', calories='53.3',
         image_url='https://vkusnoteevo.ru/wp-content/uploads/2024/05/img_10%403x.png',
         source_url='https://vkusnoteevo.ru/produkcziya/moloko/moloko-ultrapasterizovannoe-25-900-g/'),
    item('4601751003102', 'Кефир «Вкуснотеево» 1% · 1 кг', 'Молочные продукты', '99.90', 35,
         brand='Вкуснотеево', description='Кефир жирностью 1%, 1000 г.',
         ingredients='С1: обезжиренное молоко, цельное молоко, закваска, приготовленная на кефирных грибках; С2: обезжиренное молоко, цельное молоко, восстановленное молоко, закваска, приготовленная на кефирных грибках.',
         proteins='3', fats='1', carbohydrates='4', calories='37',
         image_url='https://vkusnoteevo.ru/wp-content/uploads/2024/05/img_31%403x.png',
         source_url='https://vkusnoteevo.ru/produkcziya/kefir-i-ryazhenka/kefir-1-1000-g/'),
    item('4601751003096', 'Кефир «Вкуснотеево» 3,2% · 500 г', 'Молочные продукты', '69.90', 41,
         brand='Вкуснотеево', description='Кефир жирностью 3,2%, 500 г.',
         ingredients='Молоко нормализованное, закваска, приготовленная на кефирных грибках.',
         proteins='2.8', fats='3.2', carbohydrates='4', calories='56',
         image_url='https://vkusnoteevo.ru/wp-content/uploads/2025/05/kefir_500_tbs_32%403x.png',
         source_url='https://vkusnoteevo.ru/produkcziya/kefir-i-ryazhenka/kefir-32-500-g/'),
    item('4601751016522', 'Сметана «Вкуснотеево» 15% · 150 г', 'Молочные продукты', '69.90', 27,
         brand='Вкуснотеево', description='Сметана жирностью 15%, 150 г.',
         ingredients='Нормализованные сливки, закваска молочнокислых микроорганизмов.',
         proteins='2.6', fats='15', carbohydrates='3.6', calories='160',
         image_url='https://vkusnoteevo.ru/wp-content/uploads/2024/05/smetana_150_15sh-photoroom-2-1%403x-1.png',
         source_url='https://vkusnoteevo.ru/produkcziya/smetana/smetana-15-150-g/'),
    item('4601751016584', 'Сметана «Вкуснотеево» 20% · 300 г', 'Молочные продукты', '139.90', 24,
         brand='Вкуснотеево', description='Сметана жирностью 20%, 300 г.',
         ingredients='Нормализованные сливки, закваска молочнокислых микроорганизмов.',
         proteins='2.5', fats='20', carbohydrates='3.4', calories='204',
         image_url='https://vkusnoteevo.ru/wp-content/uploads/2024/05/vko_smetana_20_300g_l%403x.png',
         source_url='https://vkusnoteevo.ru/produkcziya/smetana/smetana-20-300-g/'),
    item('4601751016546', 'Сметана «Вкуснотеево» 15% · 300 г', 'Молочные продукты', '119.90', 30,
         brand='Вкуснотеево', description='Сметана жирностью 15%, 300 г.',
         ingredients='Нормализованные сливки, закваска молочнокислых микроорганизмов.',
         proteins='2.6', fats='15', carbohydrates='3.6', calories='160',
         image_url='https://vkusnoteevo.ru/wp-content/uploads/2024/05/vko_smetana_15_300g_l%403x.png',
         source_url='https://vkusnoteevo.ru/produkcziya/smetana/smetana-15-300-g/'),
    item('4601751028686', 'Творог «Вкуснотеево» классический 2% · 180 г', 'Молочные продукты', '89.90', 34,
         brand='Вкуснотеево', description='Классический творог жирностью 2%, 180 г.',
         ingredients='Вариант 1: молоко обезжиренное, молоко цельное, закваска молочнокислых микроорганизмов. Вариант 2: молоко обезжиренное, молоко восстановленное обезжиренное, молоко цельное, закваска молочнокислых микроорганизмов.',
         proteins='15', fats='2', carbohydrates='3', calories='73.2',
         image_url='https://vkusnoteevo.ru/wp-content/uploads/2025/11/tvorog_2_180g%403x.png',
         source_url='https://vkusnoteevo.ru/produkcziya/tvorog/tvorog-klassicheskij-2-180-g/'),
    item('4601751021847', 'Творог «Вкуснотеево» классический 9% · 350 г', 'Молочные продукты', '169.90', 21,
         brand='Вкуснотеево', description='Классический творог жирностью 9%, 350 г.',
         ingredients='Вариант 1: молоко обезжиренное, молоко цельное, закваска молочнокислых микроорганизмов. Вариант 2: молоко обезжиренное восстановленное, молоко цельное, закваска молочнокислых микроорганизмов.',
         proteins='13', fats='9', carbohydrates='3', calories='145',
         image_url='https://vkusnoteevo.ru/wp-content/uploads/2024/05/350g_9%403x.png',
         source_url='https://vkusnoteevo.ru/produkcziya/tvorog/tvorog-klassicheskij-9-350-g/'),
    item('4601751027924', 'Творог «Вкуснотеево» рассыпчатый 2% · 300 г', 'Молочные продукты', '129.90', 28,
         brand='Вкуснотеево', description='Рассыпчатый творог жирностью 2%, 300 г.',
         ingredients='Вариант 1: молоко обезжиренное, молоко цельное, закваска молочнокислых микроорганизмов. Вариант 2: молоко обезжиренное, молоко восстановленное обезжиренное, молоко цельное, закваска молочнокислых микроорганизмов.',
         proteins='15', fats='2', carbohydrates='3', calories='90',
         image_url='https://vkusnoteevo.ru/wp-content/uploads/2025/05/2_tvorog_300g%403x.png',
         source_url='https://vkusnoteevo.ru/produkcziya/tvorog/tvorog-rassypchatyj-2-300-g/'),
    item('4601751027771', 'Творог «Вкуснотеево» рассыпчатый 2% · 200 г', 'Молочные продукты', '99.90', 37,
         brand='Вкуснотеево', description='Рассыпчатый творог жирностью 2%, 200 г.',
         ingredients='Вариант 1: молоко обезжиренное, молоко цельное, закваска молочнокислых микроорганизмов. Вариант 2: молоко обезжиренное, молоко цельное, молоко восстановленное обезжиренное, закваска молочнокислых микроорганизмов.',
         proteins='15', fats='2', carbohydrates='3', calories='90',
         image_url='https://vkusnoteevo.ru/wp-content/uploads/2025/11/2_tvorog_200g-photoroom-4%403x.png',
         source_url='https://vkusnoteevo.ru/produkcziya/tvorog/tvorog-rassypchatyj-2-200-g/'),
    item('4601751023360', 'Творог «Вкуснотеево» рассыпчатый 5% · 750 г', 'Молочные продукты', '259.90', 16,
         brand='Вкуснотеево', description='Рассыпчатый творог жирностью 5%, 750 г.',
         ingredients='Вариант 1: молоко обезжиренное, молоко цельное, закваска молочнокислых микроорганизмов. Вариант 2: молоко обезжиренное, молоко восстановленное обезжиренное, молоко цельное, закваска молочнокислых микроорганизмов.',
         proteins='14', fats='5', carbohydrates='3', calories='113',
         image_url='https://vkusnoteevo.ru/wp-content/uploads/2024/05/5_tvorog_750g_l%403x.png',
         source_url='https://vkusnoteevo.ru/produkcziya/tvorog/tvorog-rassypchatyj-5-750-g/'),
    item('4601751025739', 'Творог мягкий «Вкуснотеево» с вишней и черешней 5% · 120 г', 'Молочные продукты', '74.90', 33,
         brand='Вкуснотеево', description='Мягкий творог с фруктовым наполнителем «Вишня — черешня», жирность 5%, 120 г.',
         ingredients='Творог мягкий, наполнитель фруктовый «Вишня — черешня» (вишня; сахар; вода; сухой глюкозный сироп; загустители: Е1442, пектины; концентрированный черешневый сок; красители: антоцианы, кармины; концентрированный лимонный сок; регулятор кислотности цитрат натрия 3-замещенный; ароматизатор натуральный).',
         proteins='6.8', fats='4', carbohydrates='9.15', calories='99.8',
         image_url='https://vkusnoteevo.ru/wp-content/uploads/2024/05/vishnya-chereshnya-120_l%403x.png',
         source_url='https://vkusnoteevo.ru/produkcziya/tvorog-myagkij/tvorog-myagkij-s-vishnej-i-chereshnej-5-120-g/'),
    item('4601751026293', 'Йогурт питьевой «Вкуснотеево» с черникой 2% · 280 г', 'Молочные продукты', '89.90', 29,
         brand='Вкуснотеево', description='Питьевой йогурт с черникой, жирность 2%, 280 г.',
         ingredients='С1: молоко цельное, молоко обезжиренное, сахар, наполнитель фруктовый «Черника» (сахар; черника; вода; загустители: Е1442, пектины; регуляторы кислотности: лимонная кислота, цитрат натрия 3-замещенный; ароматизаторы; красители: кармины, антоцианы), комплексная пищевая добавка (желатин; молочно-сывороточные белки), сухое обезжиренное молоко, закваска молочнокислых микроорганизмов. С2: молоко цельное, молоко обезжиренное восстановленное, сахар, наполнитель фруктовый «Черника» (сахар; черника; вода; загустители: Е1442, пектины; регуляторы кислотности: лимонная кислота, цитрат натрия 3-замещенный; ароматизаторы; красители: кармины, антоцианы), комплексная пищевая добавка (желатин; молочно-сывороточные белки), закваска молочнокислых микроорганизмов.',
         proteins='3.3', fats='2', carbohydrates='13', calories='83.2',
         image_url='https://vkusnoteevo.ru/wp-content/uploads/2024/08/chernika-280%403x.png',
         source_url='https://vkusnoteevo.ru/produkcziya/jogurty/jogurt-s-chernikoj-2-280-g/'),
    item('4601751025852', 'Йогурт питьевой «Вкуснотеево» с клубникой 2% · 690 г', 'Молочные продукты', '149.90', 26,
         brand='Вкуснотеево', description='Питьевой йогурт с клубникой, жирность 2%, 690 г.',
         ingredients='С1: молоко цельное, молоко обезжиренное, сахар, наполнитель для пищевых продуктов «Клубника» (сахар; клубника; вода; загустители: Е1442, камедь рожкового дерева; ароматизатор; краситель кармины; регуляторы кислотности: цитрат натрия 3-замещенный, лимонная кислота), комплексная пищевая добавка (желатин; молочно-сывороточные белки), сухое обезжиренное молоко, закваска молочнокислых микроорганизмов. С2: молоко цельное, молоко обезжиренное восстановленное, сахар, наполнитель для пищевых продуктов «Клубника» (сахар; клубника; вода; загустители: Е1442, камедь рожкового дерева; ароматизатор; краситель кармины; регуляторы кислотности: цитрат натрия 3-замещенный, лимонная кислота), комплексная пищевая добавка (желатин; молочно-сывороточные белки), закваска молочнокислых микроорганизмов.',
         proteins='3.3', fats='2', carbohydrates='13', calories='83.2',
         image_url='https://vkusnoteevo.ru/wp-content/uploads/2024/05/klubnika-690%403x.png',
         source_url='https://vkusnoteevo.ru/produkcziya/jogurty/jogurt-s-klubnikoj-2-690-g/'),
    item('4601751025869', 'Йогурт питьевой «Вкуснотеево» с персиком 2% · 690 г', 'Молочные продукты', '149.90', 23,
         brand='Вкуснотеево', description='Питьевой йогурт с персиком, жирность 2%, 690 г.',
         ingredients='С1: молоко цельное, молоко обезжиренное, сахар, наполнитель для пищевых продуктов «Персик» (персик; сахар; вода; загустители: Е1442, камедь рожкового дерева; ароматизатор «Персик»; краситель каротины; регуляторы кислотности: цитрат натрия 3-замещенный, лимонная кислота), комплексная пищевая добавка (желатин; молочно-сывороточные белки), сухое обезжиренное молоко, закваска молочнокислых микроорганизмов. С2: молоко цельное, молоко обезжиренное восстановленное, сахар, наполнитель для пищевых продуктов «Персик» (персик; сахар; вода; загустители: Е1442, камедь рожкового дерева; ароматизатор «Персик»; краситель каротины; регуляторы кислотности: цитрат натрия 3-замещенный, лимонная кислота), комплексная пищевая добавка (желатин; молочно-сывороточные белки), закваска молочнокислых микроорганизмов.',
         proteins='3.3', fats='2', carbohydrates='13', calories='83.2',
         image_url='https://vkusnoteevo.ru/wp-content/uploads/2024/05/persik-690%403x.png',
         source_url='https://vkusnoteevo.ru/produkcziya/jogurty/jogurt-s-persikom-2-690-g/'),
    item('4601751025876', 'Йогурт питьевой «Вкуснотеево» с черникой 2% · 690 г', 'Молочные продукты', '149.90', 25,
         brand='Вкуснотеево', description='Питьевой йогурт с черникой, жирность 2%, 690 г.',
         ingredients='С1: молоко цельное, молоко обезжиренное, сахар, наполнитель фруктовый «Черника» (сахар; черника; вода; загустители: Е1442, пектины; регуляторы кислотности: лимонная кислота, цитрат натрия 3-замещенный; ароматизаторы; красители: кармины, антоцианы), комплексная пищевая добавка (желатин; молочно-сывороточные белки), сухое обезжиренное молоко, закваска молочнокислых микроорганизмов. С2: молоко цельное, молоко обезжиренное восстановленное, сахар, наполнитель фруктовый «Черника» (сахар; черника; вода; загустители: Е1442, пектины; регуляторы кислотности: лимонная кислота, цитрат натрия 3-замещенный; ароматизаторы; красители: кармины, антоцианы), комплексная пищевая добавка (желатин; молочно-сывороточные белки), закваска молочнокислых микроорганизмов.',
         proteins='3.3', fats='2', carbohydrates='13', calories='83.2',
         image_url='https://vkusnoteevo.ru/wp-content/uploads/2024/05/chernika-690%403x.png',
         source_url='https://vkusnoteevo.ru/produkcziya/jogurty/jogurt-s-chernikoj-2-690-g/'),
    item('4601751027863', 'Йогурт густой «Вкуснотеево» ананас-кокос 2,7% · 130 г', 'Молочные продукты', '64.90', 38,
         brand='Вкуснотеево', description='Густой йогурт с ананасом и кокосом, жирность 2,7%, 130 г.',
         ingredients='Молоко нормализованное, наполнитель для пищевых продуктов «Ананас-кокос» (сахар; ананас; вода; загустители: Е1442, гуаровая камедь; стружка кокосовая; ароматизатор; краситель экстракт сафлора; регулятор кислотности лимонная кислота), сухое обезжиренное молоко, комплексная пищевая добавка (желатин; молочно-сывороточные белки), закваска молочнокислых микроорганизмов.',
         proteins='3.7', fats='2.7', carbohydrates='14.2', calories='96',
         image_url='https://vkusnoteevo.ru/wp-content/uploads/2025/07/jogurt_ananas-kokos%403x.png',
         source_url='https://vkusnoteevo.ru/produkcziya/jogurt-gustoy/3d-jogurt-gustoj-ananas-kokos-27-130-g/'),
    item('4601751027856', 'Йогурт густой «Вкуснотеево» персик-маракуйя 2,7% · 130 г', 'Молочные продукты', '64.90', 34,
         brand='Вкуснотеево', description='Густой йогурт с персиком и маракуйей, жирность 2,7%, 130 г.',
         ingredients='Молоко нормализованное, наполнитель фруктовый «Персик-маракуйя» (сахар; персик; вода; загуститель Е1442; сок из маракуйи; ароматизаторы; антиокислитель аскорбиновая кислота; краситель бета-каротин), сухое обезжиренное молоко, комплексная пищевая добавка (желатин; молочно-сывороточные белки), закваска молочнокислых микроорганизмов.',
         proteins='3.7', fats='2.7', carbohydrates='14.2', calories='96',
         image_url='https://vkusnoteevo.ru/wp-content/uploads/2025/07/jogurt_persik-marakujya%403x.png',
         source_url='https://vkusnoteevo.ru/produkcziya/jogurt-gustoy/3d-jogurt-gustoj-persik-marakujya-27-130-g/'),
    item('4601751026057', 'Масло сливочное «Вкуснотеево» Традиционное 82,5% · 340 г', 'Молочные продукты', '329.90', 15,
         brand='Вкуснотеево', description='Сливочное масло жирностью 82,5%, 340 г.',
         ingredients='Пастеризованные сливки коровьего молока.',
         proteins='0.6', fats='82.5', carbohydrates='0.8', calories='748',
         image_url='https://vkusnoteevo.ru/wp-content/uploads/2024/05/img_59%403x.png',
         source_url='https://vkusnoteevo.ru/produkcziya/maslo/maslo-slivochnoe-tradiczionnoe-825-340-g/'),
    item('4601751014696', 'Сыр «Вкуснотеево» Сливочный 45% · 200 г', 'Молочные продукты', '249.90', 18,
         brand='Вкуснотеево', description='Полутвёрдый сыр «Сливочный», массовая доля жира 45%, 200 г.',
         ingredients='Молоко нормализованное (молоко обезжиренное, сливки), соль, закваска молочнокислых культур, консервант нитрат натрия, молокосвёртывающий ферментный препарат микробного происхождения.',
         proteins='24', fats='25', carbohydrates='0', calories='320',
         image_url='https://vkusnoteevo.ru/wp-content/uploads/2024/05/sliv_topsh%403x.png',
         source_url='https://vkusnoteevo.ru/produkcziya/syr/syr-slivochnyj-45-200-g-2/'),
    item('4607065718022', 'Хлебцы Dr. Korner рисовые «Сметана и зелень» · 80 г', 'Хлеб и выпечка', '109.90', 31,
         brand='Dr. Korner', description='Хрустящие рисовые хлебцы со вкусом сметаны и зелени, 80 г.',
         ingredients='Крупа рисовая, масло подсолнечное высокоолеиновое, ароматизатор пищевой натуральный «Сметана с зеленью» (мальтодекстрин, соль, ароматические компоненты, сыворотка молочная сухая, сахар, лук, крахмал картофельный, сметана сублимационной сушки с массовой долей жира 74%, петрушка сушёная, чеснок сушёный, сыр сухой, регулятор кислотности: лимонная кислота, укроп сушёный, сухое молоко с массовой долей жира 25%), соль йодированная, эмульгатор: лецитин подсолнечный, антиокислитель: экстракт розмарина, сметана сухая с массовой долей жира 15%, петрушка сушёная.',
         proteins='5.5', fats='15', carbohydrates='58', calories='390',
         image_url='https://yastatic.net/avatars/get-grocery-goods/2791769/2a3eb0c6-5d22-41bb-8836-bd3248dad015/500x500-orig',
         source_url='https://5ka.ru/product/khlebtsy-dr-korner-risovye-so-smetanoy-i-zelenyu-k--4302536/'),
    item('4607065712129', 'Хлебцы Dr. Korner гречневые с витаминами · 100 г', 'Хлеб и выпечка', '109.90', 22,
         brand='Dr. Korner', description='Хрустящие хлебцы из гречневой крупы с витаминно-минеральной смесью, 100 г.',
         ingredients='Крупа гречневая ядрица, витаминно-минеральная смесь «Колосок-1» (витамины B1, B2, B6, PP, фолиевая кислота, железо).',
         proteins='12', fats='3', carbohydrates='52', calories='280',
         image_url='https://bahetle-sib.ru/storage/goods/71005_Sk020.jpg',
         source_url='https://dieterra.ru/catalog/hlebtsy/khlebtsy-grechnevye-s-vitaminami-bezglyutenovye-dieticheskie-dr-korner-100-g/'),
    item('4607065718039', 'Хлебцы Dr. Korner рисовые с паприкой и чили · 80 г', 'Хлеб и выпечка', '109.90', 19,
         brand='Dr. Korner', description='Хрустящие рисовые хлебцы с паприкой и чили, 80 г.',
         ingredients='Крупа рисовая, масло подсолнечное высокоолеиновое, натуральная приправа с паприкой и чили (соль, декстроза, сахароза, паприка, томат, лук репчатый, специи и травы (чеснок, перец чили, перец чёрный, имбирь, кориандр), регулятор кислотности — лимонная кислота, агент антислеживающий — диоксид кремния аморфный, ароматизатор), соль йодированная, эмульгатор — лецитин подсолнечный, перец тайский молотый дроблёный, антиокислитель — экстракт розмарина.',
         proteins='5.5', fats='15', carbohydrates='58', calories='390',
         image_url='https://cdn.api.lenta.com/resample/webp/500x500/photo/768868/catalog-image/d70454ac-0104-4db9-ad38-885952e826ca.png',
         source_url='https://lenta.com/product/hlebcy-risovye-hrustyashchie-s-paprikojj-i-chili-rossiya-80g-768868/'),
    item('4600338001616', 'Вода детская «ФрутоНяня» негазированная · 1,5 л', 'Напитки', '89.90', 62,
         brand='ФрутоНяня', description='Детская питьевая негазированная вода, 1,5 л.',
         ingredients='Вода питьевая для детского питания.', proteins='0', fats='0', carbohydrates='0', calories='0',
         image_url='https://cdn-frutonyanya-ru.website.yandexcloud.net/iblock/693/693c5728cbe3f44e8fd5e0fdfb4d37c3/a85e7d846ae4ecafe8f1af9753be7d08.webp',
         source_url='https://frutonyanya.ru/products/voda/detskaya-voda-vysshey-kategorii-15-l/'),
    item('4810451000193', 'Сок «Добрый» яблочный · 1 л', 'Напитки', '129.90', 64,
         brand='Добрый', description='Яблочный осветлённый восстановленный сок, 1 л.',
         ingredients='Сок яблочный осветлённый восстановленный.', proteins='0', fats='0', carbohydrates='10.5', calories='42',
         image_url='https://delivery.metro-crimea.com/upload/iblock/8de/7ot8iw07g1uudo9dzntm6u3vlthl25o6/ru_pim_35936001003_02.png',
         source_url='https://monetka.ru/product/sok-dobryjj-yabloko-1l-rossiya-810000639/'),
]

# Older placeholder/incomplete catalog rows are hidden while their receipt history remains intact.
RETIRED_INCOMPLETE_BARCODES = (
    '4602547001319', '4602547001197', '4690502003881',
    '4602547000398', '4607014364553', '4607047830070', '4607157502645', '4607025397434',
    '4607065717551', '4607031420027', '4607124262039', '4601248002700', '4601075340099',
    '4607024205761', '4603767005408', '4607161620137', '4607188211028', '4607124893516',
    '4607109080320', '4607056860884', '4607031220061',
)
LEGACY_DEMO_BARCODES = tuple(f'460000000000{i}' for i in range(1, 17))


def is_valid_ean13(barcode):
    if not isinstance(barcode, str) or len(barcode) != 13 or not barcode.isdigit():
        return False
    weighted_sum = sum(int(digit) * (1 if index % 2 == 0 else 3)
                       for index, digit in enumerate(barcode[:12]))
    return (10 - weighted_sum % 10) % 10 == int(barcode[-1])


def validate_seed_catalog():
    """Fail before DB writes if a public demo card is incomplete or has a bad EAN."""
    barcodes = [product[0] for product in PRODUCTS]
    if len(PRODUCTS) != 30:
        raise ValueError(f'Expected 30 curated products, found {len(PRODUCTS)}')
    if len(set(barcodes)) != len(barcodes):
        raise ValueError('Seed catalog contains duplicate barcodes')
    for product in PRODUCTS:
        (barcode, name, category, brand, description, ingredients, proteins,
         fats, carbohydrates, calories, image_url, source_url, _price, _stock) = product
        if not is_valid_ean13(barcode):
            raise ValueError(f'Invalid EAN-13 for {name}: {barcode}')
        required = (name, category, brand, description, ingredients, proteins,
                    fats, carbohydrates, calories, image_url, source_url)
        if any(value is None or not str(value).strip() for value in required):
            raise ValueError(f'Incomplete product card: {name} ({barcode})')
        if not image_url.startswith('https://') or not source_url.startswith('https://'):
            raise ValueError(f'Product image and source must use HTTPS: {name}')


def ensure_product_detail_columns(conn):
    """Upgrade a persistent Lab 3 volume without dropping its receipts or users."""
    conn.execute('SET ROLE market_owner')
    for column, sql_type in (
        ('brand', 'varchar(100)'),
        ('description', 'text'),
        ('ingredients', 'text'),
        ('proteins', 'numeric(6,2)'),
        ('fats', 'numeric(6,2)'),
        ('carbohydrates', 'numeric(6,2)'),
        ('calories', 'numeric(7,2)'),
        ('image_url', 'text'),
        ('source_url', 'text'),
    ):
        conn.execute(f'ALTER TABLE market.products ADD COLUMN IF NOT EXISTS {column} {sql_type}')
    # The original UPDATE privilege was column-scoped, so add newly migrated fields.
    conn.execute('''GRANT UPDATE (brand,description,ingredients,proteins,fats,
        carbohydrates,calories,image_url,source_url) ON market.products TO market_app''')
    conn.execute('RESET ROLE')


def seed():
    validate_seed_catalog()
    passwords = {role: os.environ[f'{role.upper()}_PASSWORD'] for role in ('manager', 'cashier', 'auditor')}
    if any(len(password) < 12 for password in passwords.values()):
        raise ValueError('Initial passwords must contain at least 12 characters')

    pool = create_pool()
    pool.open(wait=True)
    try:
        with pool.connection() as conn:
            ensure_product_detail_columns(conn)
            for role, name in [('manager', 'Менеджер магазина'), ('cashier', 'Кассир магазина'), ('auditor', 'Аудитор магазина')]:
                conn.execute('''INSERT INTO app_users(username,display_name,password_hash,role)
                    VALUES (%s,%s,%s,%s) ON CONFLICT(username) DO NOTHING''',
                    (role, name, hash_password(passwords[role]), role))

            # Preserve historical receipt lines but hide the old fake EAN examples.
            conn.execute('UPDATE products SET active=false WHERE barcode = ANY(%s) AND active',
                         (list(LEGACY_DEMO_BARCODES + RETIRED_INCOMPLETE_BARCODES),))
            actor = conn.execute("SELECT id FROM app_users WHERE username='manager'").fetchone()['id']
            for product in PRODUCTS:
                (barcode, name, category, brand, description, ingredients, proteins,
                 fats, carbohydrates, calories, image_url, source_url, price, stock) = product
                row = conn.execute('''INSERT INTO products(
                    barcode,name,category,brand,description,ingredients,proteins,fats,
                    carbohydrates,calories,image_url,source_url,price,stock)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                    ON CONFLICT(barcode) DO UPDATE SET
                    name=EXCLUDED.name,category=EXCLUDED.category,brand=EXCLUDED.brand,
                    description=EXCLUDED.description,ingredients=EXCLUDED.ingredients,
                    proteins=EXCLUDED.proteins,fats=EXCLUDED.fats,
                    carbohydrates=EXCLUDED.carbohydrates,calories=EXCLUDED.calories,
                    image_url=EXCLUDED.image_url,source_url=EXCLUDED.source_url,active=true,
                    version=products.version+1,updated_at=now()
                    RETURNING id,(xmax=0) AS inserted''', product).fetchone()
                if row['inserted'] and stock:
                    conn.execute('''INSERT INTO stock_movements(product_id,actor_id,delta,reason)
                        VALUES (%s,%s,%s,%s)''',
                        (row['id'], actor, stock, 'Начальный учебный остаток'))
    finally:
        pool.close()
    print(f'Initial users and {len(PRODUCTS)} source-backed real-barcode catalog items are ready; stock and prices of existing rows are preserved.')


if __name__ == '__main__':
    seed()
