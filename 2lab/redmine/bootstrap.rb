# Idempotent setup for this isolated teaching Redmine instance, version 6.1.
# Run through rails runner; no mail is sent and passwords are never printed.
require 'csv'
ActionMailer::Base.perform_deliveries = false
rows = CSV.read('/opt/lab/backlog.csv', headers: true, encoding: 'bom|utf-8')
raise 'Expected 15 unique tasks' unless rows.size == 15 && rows.map { |r| r['External ID'] }.uniq.size == 15

ActiveRecord::Base.transaction do
  Redmine::DefaultData::Loader.load('ru') if Tracker.none?
  admin = User.find_by!(login: 'admin')
  unless Project.exists?(identifier: 'supermarket-36')
    admin.password = ENV.fetch('REDMINE_ADMIN_PASSWORD')
    admin.password_confirmation = admin.password
    admin.must_change_passwd = false
    admin.save!
  end
  User.current = admin
  Setting.default_language = 'ru'
  Setting.login_required = '1'
  Setting.self_registration = '0'
  Setting.ui_theme = 'supermarket'
  Setting.notified_events = []
  Setting.app_title = 'Учебный проект супермаркета'
  statuses = %w[Новая В\ работе На\ проверке Возвращена Закрыта Отклонена].to_h do |name|
    status = IssueStatus.find_or_initialize_by(name: name)
    status.is_closed = %w[Закрыта Отклонена].include?(name)
    status.save!
    [name, status]
  end
  trackers = %w[Требование Задача Ошибка].map do |name|
    tracker = Tracker.find_or_initialize_by(name: name)
    tracker.default_status = statuses.fetch('Новая')
    tracker.save!
    tracker
  end
  common = %i[view_project view_issues add_issues edit_issues add_issue_notes
              view_wiki_pages view_wiki_edits edit_wiki_pages view_documents
              add_documents view_files manage_files browse_repository view_changesets
              log_time view_time_entries]
  role_specs = {
    'Руководитель проекта' => common + %i[manage_members manage_versions manage_categories manage_issue_relations],
    'Специалист по ИС' => common,
    'DevOps-инженер' => common,
    'Наблюдатель' => %i[view_project view_issues view_wiki_pages view_documents view_files browse_repository]
  }
  known = Redmine::AccessControl.permissions.map(&:name)
  roles = role_specs.to_h do |name, permissions|
    role = Role.find_or_initialize_by(name: name)
    role.permissions = permissions & known
    role.save!
    [name, role]
  end
  project = Project.find_or_initialize_by(identifier: 'supermarket-36')
  project.name = 'Информационная система супермаркета — вариант 36'
  project.is_public = false
  project.enabled_module_names = %w[issue_tracking time_tracking documents wiki repository files]
  project.trackers = trackers
  project.save!
  people = [
    ['student_a', 'Роман', 'Кочетков', 'Руководитель проекта', 'STUDENT_A_PASSWORD'],
    ['student_b', 'Кирилл', 'Энгельгард', 'Специалист по ИС', 'STUDENT_B_PASSWORD'],
    ['student_c', 'Максим', 'Прохоров', 'DevOps-инженер', 'STUDENT_C_PASSWORD']
  ]
  people.each do |login, first, last, role_name, secret|
    user = User.find_or_initialize_by(login: login)
    if user.new_record?
      user.password = ENV.fetch(secret)
      user.password_confirmation = user.password
      user.mail = "#{login}@example.invalid"
    end
    user.firstname, user.lastname = first, last
    user.language = 'ru'
    user.status = User::STATUS_ACTIVE
    user.mail_notification = 'none'
    user.save!
    member = Member.find_or_initialize_by(project: project, user: user)
    member.roles = [roles.fetch(role_name)]
    member.save!
  end
  transitions = [['Новая','В работе'], ['В работе','На проверке'],
                 ['Возвращена','В работе'], ['На проверке','Возвращена'],
                 ['На проверке','Закрыта'], ['Закрыта','Возвращена']]
  trackers.each do |tracker|
    roles.each do |name, role|
      next if name == 'Наблюдатель'
      allowed = transitions.dup
      allowed << ['Новая','Отклонена'] if name == 'Руководитель проекта'
      allowed.each do |old_name, new_name|
        assigned_only = name != 'Руководитель проекта' && %w[Новая В\ работе Возвращена].include?(old_name)
        WorkflowTransition.find_or_create_by!(role_id: role.id, tracker_id: tracker.id,
          old_status_id: statuses.fetch(old_name).id, new_status_id: statuses.fetch(new_name).id,
          assignee: assigned_only, author: false)
      end
    end
  end
  fields = ['External ID', 'Depends on', 'Requirement'].to_h do |name|
    field = IssueCustomField.find_or_initialize_by(name: name)
    field.field_format = 'string'
    field.is_for_all = true
    field.is_filter = true
    field.trackers = trackers
    field.save!
    [name, field]
  end
  version = Version.find_or_create_by!(project: project, name: '1.0 Учебный выпуск')
  priority = IssuePriority.default || IssuePriority.first!
  categories = rows.map { |r| r['Category'] }.uniq.to_h do |name|
    [name, IssueCategory.find_or_create_by!(project: project, name: name)]
  end
  project.reload
  issues = {}
  rows.each do |row|
    existing = CustomValue.where(customized_type: 'Issue', custom_field_id: fields.fetch('External ID').id,
                                 value: row['External ID']).pluck(:customized_id)
    issue = project.issues.find_by(id: existing)
    unless issue
      category = categories.fetch(row['Category'])
      issue = Issue.new(project: project, subject: row['Subject'], description: row['Description'],
        tracker: trackers.find { |t| t.name == row['Tracker'] }, status: statuses.fetch('Новая'),
        author: admin, assigned_to: User.find_by!(login: row['Assigned to']), priority: priority,
        estimated_hours: row['Estimated time'], category: category, fixed_version: version)
      issue.custom_field_values = fields.to_h { |name, f| [f.id.to_s, row[name].to_s] }
      issue.save!
    end
    issues[row['External ID']] = issue
  end
  rows.each do |row|
    row['Depends on'].to_s.split(';').map(&:strip).reject(&:empty?).each do |key|
      IssueRelation.find_or_create_by!(issue_from: issues.fetch(key), issue_to: issues.fetch(row['External ID']),
                                      relation_type: 'precedes', delay: 0)
    end
  end
  puts "PASS: project=#{project.identifier}; members=#{project.members.count}; tasks=#{issues.size}; theme=#{Setting.ui_theme}"
end
